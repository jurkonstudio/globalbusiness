-- Global Business: migration 013 (run after 012, safe to re-run)
-- Retail: Grocery Store + automatic customer sales, and a longer tutorial that now ends with the first sale.
--
--   Early game (Sim Companies style):
--     1) Buy Seeds + Water  2) Plant apples  3) Harvest (about 3 min)  -> Level 1
--     4) Build a Grocery Store (about 1 min)  5) Put apples on sale  6) First customer sale -> tutorial done
--
--   How selling works (placeholder balance, tune the numbers below):
--     * A store shelf (listing) sells  4 x store level  units per minute at the reference price.
--     * Reference price = resources.retail_ref (base price x 1.8). Cheaper than that sells faster (up to x1.5),
--       dearer sells slower, and at 2x the reference price nobody buys.
--     * Sales are computed from timestamps, so the store keeps selling while the player is offline
--       (at most 24 hours are counted per visit). Goods are taken from the warehouse; no stock = no sales.
--   Nothing existing is deleted. Functions that are redefined here keep the same signature.

-- ===== 1) Data =====
alter table resources add column if not exists retail_ok boolean not null default false;
alter table resources add column if not exists retail_ref numeric(10,2);
update resources set retail_ok = true, retail_ref = round(base_price * 1.8, 2)
 where slug in ('apples', 'oranges', 'grapes', 'grain');

insert into building_types (slug, name, category, build_cost, unlock_level, has_abundance, build_seconds, description)
values ('grocery-store', 'Grocery Store', 'retail', 2000, 1, false, 60,
        'Sells fruit and grain from your warehouse to customers. Set a price per product on Retail > Stores.')
on conflict (slug) do update set name = excluded.name, category = excluded.category, build_cost = excluded.build_cost,
  unlock_level = excluded.unlock_level, build_seconds = excluded.build_seconds, description = excluded.description;

create table if not exists store_listings (
  building_id uuid not null references buildings(id) on delete cascade,
  resource_id int not null references resources(id),
  price numeric(10,2) not null check (price > 0),
  last_sold_at timestamptz not null default now(),
  sold_total numeric(14,2) not null default 0,
  revenue_total numeric(14,2) not null default 0,
  primary key (building_id, resource_id)
);
alter table store_listings enable row level security;
drop policy if exists "own store listings" on store_listings;
create policy "own store listings" on store_listings for select using (
  building_id in (select id from buildings where company_id in
    (select id from companies where owner_id = auth.uid())));
create index if not exists store_listings_resource_idx on store_listings (resource_id);
-- (012 already removed direct writes for new tables; the browser reads only, all changes go through the functions below.)

-- Ledger: allow retail sales
alter table transactions drop constraint if exists transactions_kind_check;
alter table transactions add constraint transactions_kind_check
  check (kind in ('npc_buy','npc_sell','build','upgrade','freight','mission','exchange_buy','exchange_sell','retail_sale'));

-- ===== 2) Demand rule (one place, immutable) =====
-- ratio = price / reference price.  1.5 at or below half price, 1.0 at the reference price, 0 at double price.
create or replace function retail_demand(p_price numeric, p_ref numeric)
returns numeric language sql immutable as $$
  select case when p_ref is null or p_ref <= 0 then 0
              else greatest(0, least(1.5, 2 - p_price / p_ref)) end
$$;
-- Units per minute one shelf sells at store level `p_level`.
create or replace function retail_rate_per_min(p_level int, p_price numeric, p_ref numeric)
returns numeric language sql immutable as $$
  select round(4 * greatest(p_level, 1) * retail_demand(p_price, p_ref), 4)
$$;
grant execute on function retail_demand(numeric, numeric), retail_rate_per_min(int, numeric, numeric) to authenticated;
revoke execute on function retail_demand(numeric, numeric), retail_rate_per_min(int, numeric, numeric) from public, anon;

-- ===== 3) Settle sales (internal). Caller must already hold the company row lock. =====
create or replace function retail_settle(p_company uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l record; start_at timestamptz; secs numeric; rate numeric; potential numeric; have numeric; n numeric; rev numeric;
  total_n numeric := 0; total_rev numeric := 0;
begin
  for l in
    select sl.building_id, sl.resource_id, sl.price, sl.last_sold_at, b.level as blevel, b.build_finish_at,
           r.retail_ref, r.name as rname
      from store_listings sl
      join buildings b on b.id = sl.building_id
      join resources r on r.id = sl.resource_id
     where b.company_id = p_company
       and (b.build_finish_at is null or b.build_finish_at <= now())
     order by sl.last_sold_at
       for update of sl
  loop
    start_at := greatest(l.last_sold_at, coalesce(l.build_finish_at, l.last_sold_at), now() - interval '24 hours');
    secs := extract(epoch from (now() - start_at));
    rate := retail_rate_per_min(l.blevel, l.price, l.retail_ref) / 60.0;      -- units per second
    if rate <= 0 or secs <= 0 then
      update store_listings set last_sold_at = now() where building_id = l.building_id and resource_id = l.resource_id;
      continue;
    end if;
    potential := floor(secs * rate);
    select coalesce(quantity, 0) into have from inventory where company_id = p_company and resource_id = l.resource_id;
    n := least(potential, floor(coalesce(have, 0)));
    if n >= 1 then
      update inventory set quantity = quantity - n where company_id = p_company and resource_id = l.resource_id;
      rev := round(n * l.price, 2);
      perform apply_cash(p_company, rev, 'retail_sale', l.resource_id, n, 'grocery-store');
      update store_listings set sold_total = sold_total + n, revenue_total = revenue_total + rev
       where building_id = l.building_id and resource_id = l.resource_id;
      total_n := total_n + n; total_rev := total_rev + rev;
    end if;
    -- Out of stock: demand is not banked. Otherwise only the time that was actually used is consumed,
    -- so the fraction of a customer that is left over carries into the next settle.
    update store_listings
       set last_sold_at = case when n < potential then now() else start_at + make_interval(secs => n / rate) end
     where building_id = l.building_id and resource_id = l.resource_id;
  end loop;

  if total_n >= 1 then
    -- The first sale finishes the tutorial (existing players already have tutorial_done = true: no effect).
    update companies set tutorial_done = true, xp = xp + 25, level = greatest(level, (xp + 25) / 100)
     where id = p_company and not tutorial_done;
  end if;
  return jsonb_build_object('sold', total_n, 'revenue', total_rev);
end $$;
revoke execute on function retail_settle(uuid) from public, anon, authenticated;

-- Called by the app before it shows retail data.
create or replace function retail_sync()
returns jsonb language plpgsql security definer set search_path = public as $$
declare comp uuid; res jsonb;
begin
  select id into comp from companies where owner_id = auth.uid() for update;
  if comp is null then return null; end if;
  res := retail_settle(comp);
  return res;
end $$;
revoke execute on function retail_sync() from public, anon;
grant execute on function retail_sync() to authenticated;

-- ===== 4) Player actions =====
create or replace function set_store_listing(p_building uuid, p_resource int, p_price numeric)
returns void language plpgsql security definer set search_path = public as $$
declare comp uuid; b buildings%rowtype; t building_types%rowtype; r resources%rowtype; n int;
begin
  select id into comp from companies where owner_id = auth.uid() for update;
  if comp is null then raise exception 'Create a company first'; end if;
  select * into b from buildings where id = p_building and company_id = comp;
  if not found then raise exception 'Store not found'; end if;
  select * into t from building_types where id = b.type_id;
  if t.slug <> 'grocery-store' then raise exception 'This building is not a store'; end if;
  if b.build_finish_at is not null and b.build_finish_at > now() then raise exception 'The store is still under construction'; end if;
  select * into r from resources where id = p_resource and retail_ok;
  if not found then raise exception 'This product cannot be sold in a grocery store'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Invalid price'; end if;
  if p_price <> round(p_price, 2) then raise exception 'Price may have at most 2 decimals'; end if;
  if p_price > r.retail_ref * 3 then raise exception 'Price is too high (maximum %)', round(r.retail_ref * 3, 2); end if;
  perform retail_settle(comp);                       -- book sales made at the old price first
  select count(*) into n from store_listings where building_id = b.id and resource_id <> p_resource;
  if n >= 4 then raise exception 'A store holds at most 4 products'; end if;
  insert into store_listings (building_id, resource_id, price) values (b.id, p_resource, p_price)
  on conflict (building_id, resource_id) do update set price = excluded.price, last_sold_at = now();
end $$;
revoke execute on function set_store_listing(uuid, int, numeric) from public, anon;
grant execute on function set_store_listing(uuid, int, numeric) to authenticated;

create or replace function remove_store_listing(p_building uuid, p_resource int)
returns void language plpgsql security definer set search_path = public as $$
declare comp uuid;
begin
  select id into comp from companies where owner_id = auth.uid() for update;
  if comp is null then raise exception 'Create a company first'; end if;
  if not exists (select 1 from buildings where id = p_building and company_id = comp) then raise exception 'Store not found'; end if;
  perform retail_settle(comp);
  delete from store_listings where building_id = p_building and resource_id = p_resource;
end $$;
revoke execute on function remove_store_listing(uuid, int) from public, anon;
grant execute on function remove_store_listing(uuid, int) to authenticated;

-- ===== 5) Existing functions that now know about retail =====
-- Harvest: same as migration 011, except the tutorial no longer ends here. The first harvest still grants Level 1;
-- the tutorial ends with the first retail sale (see retail_settle).
create or replace function collect_production(p_job uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare comp uuid; j production_jobs%rowtype; rc recipes%rowtype; b buildings%rowtype; bt building_types%rowtype;
        rg regions%rowtype; res resources%rowtype; amt numeric; fr numeric := 0; cash_now numeric;
begin
  select id, cash into comp, cash_now from companies where owner_id = auth.uid() for update;
  if comp is null then raise exception 'Create a company first'; end if;
  select * into j from production_jobs where id = p_job and not collected for update;
  if not found then raise exception 'Job not found'; end if;
  select * into b from buildings where id = j.building_id and company_id = comp;
  if not found then raise exception 'Not your building'; end if;
  if j.finish_at > now() then raise exception 'Production is not finished yet'; end if;
  select * into rc from recipes where id = j.recipe_id;
  select * into bt from building_types where id = b.type_id;
  select * into rg from regions where id = b.region_id;
  select * into res from resources where id = rc.output_resource_id;

  amt := round(rc.output_qty * j.runs * j.capacity * coalesce(b.abundance / 100, 1)
         * (1 + case when rg.bonus_category is not null and rg.bonus_category = bt.category then rg.bonus_pct else 0 end / 100.0), 2);
  fr := least(round(rg.distance * amt * coalesce(res.transport, 1) * 0.02, 2), cash_now);

  if fr > 0 then perform apply_cash(comp, -fr, 'freight', res.id, amt, rg.id); end if;
  perform add_stock(comp, rc.output_resource_id, amt);
  update production_jobs set collected = true where id = j.id;
  update companies set xp = xp + 10 * j.runs, level = greatest(level, (xp + 10 * j.runs) / 100) where id = comp;
  update companies set xp = greatest(xp, 100), level = greatest(level, 1) where id = comp and not tutorial_done;
  return amt;
end $$;

create or replace function sync_progress()
returns void language plpgsql security definer set search_path = public as $$
declare comp uuid;
begin
  select id into comp from companies where owner_id = auth.uid() for update;
  if comp is not null then perform settle_buildings(comp); perform retail_settle(comp); end if;
end $$;

-- "While you were away" now also reports retail sales.
create or replace function welcome_back()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; built int; upg int; crops int; away int; rs jsonb;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then return null; end if;
  perform settle_buildings(c.id);
  rs := retail_settle(c.id);
  away := extract(epoch from (now() - c.last_seen_at))::int;
  select count(*) into built from buildings
    where company_id = c.id and build_finish_at > c.last_seen_at and build_finish_at <= now();
  select count(*) into upg from buildings
    where company_id = c.id and upgraded_at > c.last_seen_at and upgraded_at <= now();
  select count(*) into crops from production_jobs j join buildings b on b.id = j.building_id
    where b.company_id = c.id and not j.collected and j.finish_at <= now();
  update companies set last_seen_at = now() where id = c.id;
  return jsonb_build_object('away_seconds', away, 'built', built, 'upgraded', upg, 'ready', crops,
                            'sold', (rs ->> 'sold')::numeric, 'revenue', (rs ->> 'revenue')::numeric);
end $$;

-- ===== 6) Missions: two new early goals, order shifted so the retail steps come right after the tutorial =====
insert into missions (id, ord, title, descr, reward_cash, reward_xp) values
  ('name',        1, 'Make it yours',    'Give your company a real name (Headquarters).',                 500, 20),
  ('grocery',     2, 'Open for business','Build a Grocery Store.',                                        600, 30),
  ('first_sale',  3, 'First customers',  'Sell goods in your store (Retail > Stores).',                   600, 30),
  ('water',       4, 'Water supply',     'Build a Water Reservoir.',                                      750, 30),
  ('power',       5, 'Keep the lights on','Build a Power Plant.',                                         750, 30),
  ('plantation',  6, 'Grow your farm',   'Build a Plantation.',                                          1000, 40),
  ('first_water', 7, 'First delivery',   'Collect a batch of Water from your reservoir.',                 500, 30),
  ('expand',      8, 'Cross the sea',    'Build in another region (unlocks at Level 2).',                2000, 80),
  ('five',        9, 'Small empire',     'Operate 5 buildings.',                                         2500, 100),
  ('level3',     10, 'Rising company',   'Reach company level 3.',                                       3000, 100)
on conflict (id) do update set ord = excluded.ord, title = excluded.title, descr = excluded.descr,
  reward_cash = excluded.reward_cash, reward_xp = excluded.reward_xp;

create or replace function mission_done(p_company uuid, p_id text)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare c companies%rowtype;
begin
  select * into c from companies where id = p_company;
  return case p_id
    when 'name'        then c.name !~ '^Company [0-9A-Za-z]{5,6}$'
    when 'grocery'     then exists (select 1 from buildings b join building_types t on t.id = b.type_id where b.company_id = c.id and t.slug = 'grocery-store')
    when 'first_sale'  then exists (select 1 from transactions x where x.company_id = c.id and x.kind = 'retail_sale')
    when 'water'       then exists (select 1 from buildings b join building_types t on t.id = b.type_id where b.company_id = c.id and t.slug = 'water-reservoir')
    when 'power'       then exists (select 1 from buildings b join building_types t on t.id = b.type_id where b.company_id = c.id and t.slug = 'power-plant')
    when 'plantation'  then exists (select 1 from buildings b join building_types t on t.id = b.type_id where b.company_id = c.id and t.slug = 'plantation')
    when 'first_water' then exists (select 1 from production_jobs j join buildings b on b.id = j.building_id
                                    join recipes r on r.id = j.recipe_id join resources s on s.id = r.output_resource_id
                                    where b.company_id = c.id and j.collected and s.slug = 'water')
    when 'expand'      then exists (select 1 from buildings b where b.company_id = c.id and b.region_id <> 'home')
    when 'five'        then (select count(*) from buildings b where b.company_id = c.id) >= 5
    when 'level3'      then c.level >= 3
    else false end;
end $$;

-- ===== 7) Result =====
select 'grocery-store' as item, case when exists (select 1 from building_types where slug = 'grocery-store') then 'ok' else 'MISSING' end as status
union all select 'store_listings', case when to_regclass('public.store_listings') is not null then 'ok' else 'MISSING' end
union all select 'retail_sync()', case when to_regprocedure('public.retail_sync()') is not null then 'ok' else 'MISSING' end
union all select 'products on sale', count(*)::text from resources where retail_ok;
