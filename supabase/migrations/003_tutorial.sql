-- Global Business: tutorial, land slots, $5,000 start (run after 002)

alter table companies alter column cash set default 5000, alter column level set default 0;
alter table companies add column if not exists tutorial_done boolean not null default false;
alter table buildings add column if not exists slot int check (slot between 0 and 23);
create unique index if not exists buildings_slot_uq on buildings (company_id, slot) where slot is not null;

-- Tutorial building and recipe (3 minutes to grow apples)
insert into building_types (slug, name, category, build_cost, unlock_level, has_abundance, description)
values ('apple-orchard', 'Apple Orchard', 'agriculture', 1000, 0, false, 'Your first building. Grows apples from seeds and water.')
on conflict (slug) do update set build_cost = 1000, unlock_level = 0;

insert into recipes (building_type_id, output_resource_id, output_qty, duration_seconds)
select b.id, r.id, 10, 180 from building_types b, resources r
where b.slug = 'apple-orchard' and r.slug = 'apples'
on conflict (building_type_id, output_resource_id) do update set output_qty = 10, duration_seconds = 180;

insert into recipe_inputs (recipe_id, resource_id, qty)
select rc.id, r.id, v.q from recipes rc
join building_types b on b.id = rc.building_type_id and b.slug = 'apple-orchard'
join (values ('seeds', 1), ('water', 2)) v(rslug, q) on true
join resources r on r.slug = v.rslug
on conflict (recipe_id, resource_id) do update set qty = excluded.qty;

-- Cheaper costs for the first levels (placeholders)
update building_types set build_cost = 1500, unlock_level = 1 where slug = 'water-reservoir';
update building_types set build_cost = 2000, unlock_level = 1 where slug = 'power-plant';
update building_types set build_cost = 3000, unlock_level = 1 where slug = 'plantation';
update building_types set build_cost = 6000, unlock_level = 2 where slug in ('mine', 'quarry');
update building_types set build_cost = 8000, unlock_level = 3 where slug = 'brick-factory';

-- Level is now xp / 100 (starts at 0). Buildings need a land slot.
drop function if exists build_building(text);
create or replace function build_building(p_type_slug text, p_slot int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; t building_types%rowtype; new_id uuid; ab numeric;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  select * into t from building_types where slug = p_type_slug;
  if not found then raise exception 'Unknown building type'; end if;
  if p_slot is null or p_slot < 0 or p_slot > 23 then raise exception 'Choose a land slot'; end if;
  if exists (select 1 from buildings where company_id = c.id and slot = p_slot) then
    raise exception 'That slot is already used';
  end if;
  if c.level < t.unlock_level then raise exception 'Requires company level %', t.unlock_level; end if;
  if c.cash < t.build_cost then raise exception 'Not enough cash'; end if;
  if t.has_abundance then ab := round((70 + random() * 25)::numeric, 2); end if;
  update companies set cash = cash - t.build_cost, xp = xp + 50, level = (xp + 50) / 100 where id = c.id;
  insert into buildings (company_id, type_id, abundance, slot) values (c.id, t.id, ab, p_slot)
    returning id into new_id;
  return new_id;
end $$;

-- Tutorial action: build the orchard on a slot and start growing apples in one step.
create or replace function plant_apples(p_slot int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare t building_types%rowtype; rid int; bid uuid;
begin
  select * into t from building_types where slug = 'apple-orchard';
  select id into rid from recipes where building_type_id = t.id limit 1;
  bid := build_building('apple-orchard', p_slot);
  return start_production(bid, rid, 1);   -- fails (and rolls back) without seeds and water
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
  update companies set xp = xp + 10 * j.runs, level = (xp + 10 * j.runs) / 100 where id = comp;
  -- First harvest completes the tutorial and grants Level 1.
  update companies set tutorial_done = true, xp = greatest(xp, 100), level = greatest(level, 1)
    where id = comp and not tutorial_done;
  return amt;
end $$;
