-- Global Business: server-side timers + offline progress (run after 005, safe to re-run)
-- Everything is stored as timestamps in Postgres. The browser only displays; when a player leaves,
-- construction, upgrades and crops keep "running" because they are just finish times.

-- ===== 1) Columns =====
alter table building_types add column if not exists build_seconds int not null default 0;
alter table buildings add column if not exists build_finish_at timestamptz;     -- under construction while in the future
alter table buildings add column if not exists upgrade_finish_at timestamptz;   -- upgrading while set
alter table buildings add column if not exists upgrade_to int;
alter table buildings add column if not exists upgraded_at timestamptz;         -- when the last upgrade completed
alter table companies add column if not exists last_seen_at timestamptz not null default now();

-- Construction time per building (placeholders; the tutorial orchard is instant)
update building_types set build_seconds = 0   where slug = 'apple-orchard';
update building_types set build_seconds = 120 where slug = 'water-reservoir';
update building_types set build_seconds = 180 where slug = 'power-plant';
update building_types set build_seconds = 300 where slug = 'plantation';
update building_types set build_seconds = 600 where slug in ('mine', 'quarry');
update building_types set build_seconds = 900 where slug = 'brick-factory';

-- ===== 2) Settle finished upgrades (lazy: runs whenever the player acts or the app syncs) =====
create or replace function settle_buildings(p_company uuid)
returns void language sql security definer set search_path = public as $$
  update buildings
     set level = upgrade_to, upgraded_at = upgrade_finish_at, upgrade_to = null, upgrade_finish_at = null
   where company_id = p_company and upgrade_finish_at is not null and upgrade_finish_at <= now();
$$;
revoke execute on function settle_buildings(uuid) from public, anon, authenticated;

create or replace function sync_progress()
returns void language plpgsql security definer set search_path = public as $$
declare comp uuid;
begin
  select id into comp from companies where owner_id = auth.uid();
  if comp is not null then perform settle_buildings(comp); end if;
end $$;
grant execute on function sync_progress() to authenticated;

-- ===== 3) Build: construction takes build_seconds =====
create or replace function build_building(p_type_slug text, p_slot int default null, p_region text default 'home')
returns uuid language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; t building_types%rowtype; rg regions%rowtype; new_id uuid; ab numeric; cost numeric;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  select * into t from building_types where slug = p_type_slug;
  if not found then raise exception 'Unknown building type'; end if;
  select * into rg from regions where id = coalesce(p_region, 'home');
  if not found then raise exception 'Unknown region'; end if;
  if c.level < rg.unlock_level then raise exception '% unlocks at company level %', rg.name, rg.unlock_level; end if;
  if p_slot is null or p_slot < 0 or p_slot >= rg.slots then raise exception 'Choose a land slot'; end if;
  if exists (select 1 from buildings where company_id = c.id and region_id = rg.id and slot = p_slot) then
    raise exception 'That slot is already used';
  end if;
  if c.level < t.unlock_level then raise exception 'Requires company level %', t.unlock_level; end if;
  cost := t.build_cost + rg.distance * 500;
  if c.cash < cost then raise exception 'Not enough cash (need $%)', cost; end if;
  if t.has_abundance then ab := round((70 + random() * 25)::numeric, 2); end if;
  update companies set cash = cash - cost, xp = xp + 50, level = greatest(level, (xp + 50) / 100) where id = c.id;
  insert into buildings (company_id, type_id, abundance, slot, region_id, build_finish_at)
    values (c.id, t.id, ab, p_slot, rg.id, case when t.build_seconds > 0 then now() + make_interval(secs => t.build_seconds) end)
    returning id into new_id;
  return new_id;
end $$;

-- ===== 4) Upgrade: cost and time grow with level (max level 6) =====
create or replace function upgrade_cost(p_build_cost numeric, p_level int)
returns numeric language sql immutable as $$ select round(p_build_cost * p_level * 0.6) $$;
create or replace function upgrade_seconds(p_build_seconds int, p_level int)
returns int language sql immutable as $$ select greatest(p_build_seconds, 60) * p_level $$;
grant execute on function upgrade_cost(numeric, int), upgrade_seconds(int, int) to anon, authenticated;

create or replace function upgrade_building(p_building uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; b buildings%rowtype; t building_types%rowtype; cost numeric; fin timestamptz;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  perform settle_buildings(c.id);
  select * into b from buildings where id = p_building and company_id = c.id for update;
  if not found then raise exception 'Building not found'; end if;
  select * into t from building_types where id = b.type_id;
  if b.build_finish_at is not null and b.build_finish_at > now() then raise exception 'Still under construction'; end if;
  if b.upgrade_finish_at is not null then raise exception 'Already upgrading'; end if;
  if b.level >= 6 then raise exception 'Maximum level reached'; end if;
  if exists (select 1 from production_jobs where building_id = b.id and not collected) then
    raise exception 'Collect or finish production before upgrading';
  end if;
  cost := upgrade_cost(t.build_cost, b.level);
  if c.cash < cost then raise exception 'Not enough cash (need $%)', cost; end if;
  fin := now() + make_interval(secs => upgrade_seconds(t.build_seconds, b.level));
  update companies set cash = cash - cost, xp = xp + 20, level = greatest(level, (xp + 20) / 100) where id = c.id;
  update buildings set upgrade_to = b.level + 1, upgrade_finish_at = fin where id = b.id;
  return fin;
end $$;
grant execute on function upgrade_building(uuid) to authenticated;

-- ===== 5) Production cannot run while a building is being built or upgraded =====
create or replace function start_production(p_building uuid, p_recipe int, p_runs int default 1)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare comp uuid; b buildings%rowtype; rc recipes%rowtype; i recipe_inputs%rowtype; fin timestamptz;
begin
  select id into comp from companies where owner_id = auth.uid() for update;
  if comp is null then raise exception 'Create a company first'; end if;
  perform settle_buildings(comp);
  select * into b from buildings where id = p_building and company_id = comp;
  if not found then raise exception 'Building not found'; end if;
  if b.build_finish_at is not null and b.build_finish_at > now() then raise exception 'Still under construction'; end if;
  if b.upgrade_finish_at is not null then raise exception 'Building is being upgraded'; end if;
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

-- ===== 6) "While you were away" report (also records the visit) =====
create or replace function welcome_back()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; built int; upg int; crops int; away int;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then return null; end if;
  perform settle_buildings(c.id);
  away := extract(epoch from (now() - c.last_seen_at))::int;
  select count(*) into built from buildings
    where company_id = c.id and build_finish_at > c.last_seen_at and build_finish_at <= now();
  select count(*) into upg from buildings
    where company_id = c.id and upgraded_at > c.last_seen_at and upgraded_at <= now();
  select count(*) into crops from production_jobs j join buildings b on b.id = j.building_id
    where b.company_id = c.id and not j.collected and j.finish_at <= now();
  update companies set last_seen_at = now() where id = c.id;
  return jsonb_build_object('away_seconds', away, 'built', built, 'upgraded', upg, 'ready', crops);
end $$;
grant execute on function welcome_back() to authenticated;

-- ===== 7) Heartbeat: the app calls this every minute while open, so "away" time is measured from the real last visit =====
create or replace function touch_seen()
returns void language sql security definer set search_path = public as $$
  update companies set last_seen_at = now() where owner_id = auth.uid();
$$;
grant execute on function touch_seen() to authenticated;
