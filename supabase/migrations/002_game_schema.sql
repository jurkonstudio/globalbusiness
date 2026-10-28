-- Global Business: game schema, stage 2 (safe to re-run)

alter table companies add column if not exists xp int not null default 0;
alter table resources add column if not exists category text not null default 'raw';
alter table resources add column if not exists transport numeric(6,2) not null default 1;
alter table resources add column if not exists npc_sells boolean not null default false;
alter table building_types add column if not exists category text not null default 'production';
alter table building_types add column if not exists description text;
alter table building_types add column if not exists unlock_level int not null default 1;
alter table building_types add column if not exists has_abundance boolean not null default false;
alter table buildings add column if not exists abundance numeric(5,2);

create table if not exists recipes (
  id serial primary key,
  building_type_id int not null references building_types(id) on delete cascade,
  output_resource_id int not null references resources(id),
  output_qty numeric(10,2) not null,
  duration_seconds int not null,
  unique (building_type_id, output_resource_id)
);
create table if not exists recipe_inputs (
  recipe_id int references recipes(id) on delete cascade,
  resource_id int references resources(id),
  qty numeric(10,2) not null,
  primary key (recipe_id, resource_id)
);
create table if not exists production_jobs (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  recipe_id int not null references recipes(id),
  runs int not null default 1,
  started_at timestamptz not null default now(),
  finish_at timestamptz not null,
  collected boolean not null default false
);
create table if not exists economy (
  id int primary key default 1 check (id = 1),
  phase text not null default 'normal' check (phase in ('recession','normal','boom')),
  npc_markup numeric(4,2) not null default 1.5,
  updated_at timestamptz not null default now()
);
insert into economy (id) values (1) on conflict do nothing;
create table if not exists market_orders (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references companies(id) on delete cascade,
  resource_id int not null references resources(id),
  qty numeric(14,2) not null check (qty > 0),
  price numeric(12,2) not null check (price > 0),
  created_at timestamptz not null default now()
);

alter table recipes enable row level security;
alter table recipe_inputs enable row level security;
alter table production_jobs enable row level security;
alter table economy enable row level security;
alter table market_orders enable row level security;
drop policy if exists "public recipes" on recipes;
create policy "public recipes" on recipes for select using (true);
drop policy if exists "public recipe inputs" on recipe_inputs;
create policy "public recipe inputs" on recipe_inputs for select using (true);
drop policy if exists "public economy" on economy;
create policy "public economy" on economy for select using (true);
drop policy if exists "public orders" on market_orders;
create policy "public orders" on market_orders for select using (true);
drop policy if exists "own jobs" on production_jobs;
create policy "own jobs" on production_jobs for select using (
  building_id in (select id from buildings where company_id in
    (select id from companies where owner_id = auth.uid())));

-- ===== Seed data (balance values are placeholders, tune freely) =====
delete from building_types where slug = 'lumber-mill';
delete from resources where slug in ('wood', 'iron-ore');

insert into resources (slug, name, category, base_price, npc_sells) values
  ('power','Power','utility',0.5,true), ('water','Water','utility',0.4,true),
  ('seeds','Seeds','agriculture',2,true),
  ('apples','Apples','food',4,false), ('oranges','Oranges','food',4.5,false),
  ('grapes','Grapes','food',5,false), ('grain','Grain','food',3,false),
  ('minerals','Minerals','raw',6,false), ('clay','Clay','raw',3,false),
  ('limestone','Limestone','raw',2.5,false), ('sand','Sand','raw',2,false),
  ('bricks','Bricks','construction',10,true), ('planks','Planks','construction',8,true)
on conflict (slug) do update set name = excluded.name, category = excluded.category,
  base_price = excluded.base_price, npc_sells = excluded.npc_sells;

insert into building_types (slug, name, category, build_cost, unlock_level, has_abundance, description) values
  ('water-reservoir','Water Reservoir','utility',4000,1,false,'Collects water for your production.'),
  ('power-plant','Power Plant','utility',6000,1,false,'Generates power for your buildings.'),
  ('plantation','Plantation','agriculture',8000,1,false,'Grows fruit and grain from seeds.'),
  ('mine','Mine','extraction',12000,2,true,'Extracts minerals. Output depends on abundance.'),
  ('quarry','Quarry','extraction',12000,2,true,'Digs clay, limestone and sand.'),
  ('brick-factory','Brick Factory','construction',15000,3,false,'Fires clay and limestone into bricks.')
on conflict (slug) do update set name = excluded.name, category = excluded.category,
  build_cost = excluded.build_cost, unlock_level = excluded.unlock_level,
  has_abundance = excluded.has_abundance, description = excluded.description;

insert into recipes (building_type_id, output_resource_id, output_qty, duration_seconds)
select b.id, r.id, v.q, v.s
from (values
  ('water-reservoir','water',20,600), ('power-plant','power',20,600),
  ('plantation','apples',10,1800), ('plantation','oranges',10,1800),
  ('plantation','grapes',8,1800), ('plantation','grain',15,1500),
  ('mine','minerals',1,600),
  ('quarry','clay',2,600), ('quarry','limestone',2,600), ('quarry','sand',3,600),
  ('brick-factory','bricks',2,900)
) v(bslug, rslug, q, s)
join building_types b on b.slug = v.bslug
join resources r on r.slug = v.rslug
on conflict (building_type_id, output_resource_id) do update
  set output_qty = excluded.output_qty, duration_seconds = excluded.duration_seconds;

insert into recipe_inputs (recipe_id, resource_id, qty)
select rc.id, r.id, v.q
from recipes rc
join building_types b on b.id = rc.building_type_id
join (values
  ('plantation','seeds',1), ('plantation','water',2), ('plantation','power',5),
  ('mine','power',20), ('mine','water',1),
  ('quarry','power',10), ('quarry','water',1),
  ('power-plant','water',1),
  ('brick-factory','power',10), ('brick-factory','water',1),
  ('brick-factory','clay',2), ('brick-factory','limestone',1)
) v(bslug, rslug, q) on v.bslug = b.slug
join resources r on r.slug = v.rslug
on conflict (recipe_id, resource_id) do update set qty = excluded.qty;

-- ===== Game logic (server side) =====
create or replace function add_stock(p_company uuid, p_resource int, p_qty numeric)
returns void language sql security definer set search_path = public as $$
  insert into inventory (company_id, resource_id, quantity) values (p_company, p_resource, p_qty)
  on conflict (company_id, resource_id) do update set quantity = inventory.quantity + excluded.quantity;
$$;
revoke execute on function add_stock(uuid, int, numeric) from public, anon, authenticated;

create or replace function build_building(p_type_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; t building_types%rowtype; new_id uuid; ab numeric;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  select * into t from building_types where slug = p_type_slug;
  if not found then raise exception 'Unknown building type'; end if;
  if c.level < t.unlock_level then raise exception 'Requires company level %', t.unlock_level; end if;
  if c.cash < t.build_cost then raise exception 'Not enough cash'; end if;
  if t.has_abundance then ab := round((70 + random() * 25)::numeric, 2); end if;
  update companies set cash = cash - t.build_cost, xp = xp + 50, level = 1 + (xp + 50) / 100 where id = c.id;
  insert into buildings (company_id, type_id, abundance) values (c.id, t.id, ab) returning id into new_id;
  return new_id;
end $$;

create or replace function buy_from_npc(p_resource int, p_qty numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; r resources%rowtype; mk numeric; cost numeric;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  select * into r from resources where id = p_resource and npc_sells;
  if not found then raise exception 'The NPC does not sell this'; end if;
  if p_qty <= 0 or p_qty > 100000 then raise exception 'Invalid quantity'; end if;
  select npc_markup into mk from economy where id = 1;
  cost := round(r.base_price * coalesce(mk, 1.5) * p_qty, 2);
  if c.cash < cost then raise exception 'Not enough cash'; end if;
  update companies set cash = cash - cost where id = c.id;
  perform add_stock(c.id, r.id, p_qty);
  return cost;
end $$;

create or replace function start_production(p_building uuid, p_recipe int, p_runs int default 1)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare comp uuid; b buildings%rowtype; rc recipes%rowtype; i recipe_inputs%rowtype; fin timestamptz;
begin
  select id into comp from companies where owner_id = auth.uid() for update;
  if comp is null then raise exception 'Create a company first'; end if;
  select * into b from buildings where id = p_building and company_id = comp;
  if not found then raise exception 'Building not found'; end if;
  select * into rc from recipes where id = p_recipe and building_type_id = b.type_id;
  if not found then raise exception 'This building cannot make that'; end if;
  if p_runs < 1 or p_runs > 20 then raise exception 'Runs must be between 1 and 20'; end if;
  if exists (select 1 from production_jobs where building_id = b.id and not collected) then
    raise exception 'Building is busy';
  end if;
  for i in select * from recipe_inputs where recipe_id = rc.id loop
    update inventory set quantity = quantity - i.qty * p_runs
      where company_id = comp and resource_id = i.resource_id and quantity >= i.qty * p_runs;
    if not found then
      raise exception 'Not enough % in your warehouse', (select name from resources where id = i.resource_id);
    end if;
  end loop;
  fin := now() + make_interval(secs => rc.duration_seconds * p_runs);
  insert into production_jobs (building_id, recipe_id, runs, finish_at) values (b.id, rc.id, p_runs, fin);
  return fin;
end $$;

create or replace function collect_production(p_job uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare comp uuid; j production_jobs%rowtype; rc recipes%rowtype; b buildings%rowtype; amt numeric;
begin
  select id into comp from companies where owner_id = auth.uid() for update;
  select * into j from production_jobs where id = p_job and not collected for update;
  if not found then raise exception 'Job not found'; end if;
  select * into b from buildings where id = j.building_id and company_id = comp;
  if not found then raise exception 'Not your building'; end if;
  if j.finish_at > now() then raise exception 'Production is not finished yet'; end if;
  select * into rc from recipes where id = j.recipe_id;
  amt := round(rc.output_qty * j.runs * coalesce(b.abundance / 100, 1), 2);
  perform add_stock(comp, rc.output_resource_id, amt);
  update production_jobs set collected = true where id = j.id;
  update companies set xp = xp + 10 * j.runs, level = 1 + (xp + 10 * j.runs) / 100 where id = comp;
  return amt;
end $$;

-- Player exchange (UI comes in the next session)
create or replace function list_on_exchange(p_resource int, p_qty numeric, p_price numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare comp uuid; oid uuid;
begin
  select id into comp from companies where owner_id = auth.uid() for update;
  if comp is null then raise exception 'Create a company first'; end if;
  if p_qty <= 0 or p_price <= 0 then raise exception 'Invalid quantity or price'; end if;
  update inventory set quantity = quantity - p_qty
    where company_id = comp and resource_id = p_resource and quantity >= p_qty;
  if not found then raise exception 'Not enough stock'; end if;
  insert into market_orders (seller_id, resource_id, qty, price) values (comp, p_resource, p_qty, p_price)
    returning id into oid;
  return oid;
end $$;

create or replace function buy_from_exchange(p_order uuid, p_qty numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; o market_orders%rowtype; cost numeric;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  select * into o from market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.seller_id = c.id then raise exception 'You cannot buy your own order'; end if;
  if p_qty <= 0 or p_qty > o.qty then raise exception 'Invalid quantity'; end if;
  cost := round(p_qty * o.price, 2);
  if c.cash < cost then raise exception 'Not enough cash'; end if;
  update companies set cash = cash - cost where id = c.id;
  update companies set cash = cash + cost where id = o.seller_id;
  perform add_stock(c.id, o.resource_id, p_qty);
  if p_qty = o.qty then delete from market_orders where id = o.id;
  else update market_orders set qty = qty - p_qty where id = o.id; end if;
  return cost;
end $$;
