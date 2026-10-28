-- Global Business: migration 024 (run after 023). Longer timers for production, construction and upgrades.
-- Run it ONCE in Supabase > SQL Editor. Safe to re-run: it always scales from the saved original values (base_*),
-- so running it twice does not multiply twice. To change the speed, edit `mult` below and run it again.
--   * recipes.duration_seconds        = original * mult   (production)
--   * building_types.build_seconds    = original * mult   (construction; apple-orchard and grocery-store stay as they were)
--   * upgrade_seconds()               = max(build_seconds, 600) * level   (the old floor was 60 s, now 10 min)
--   * start_production()              = tutorial companies keep the ORIGINAL duration, so the first apples still take ~3 min
-- Jobs and upgrades that are already running keep the finish time they were given.

alter table recipes        add column if not exists base_duration_seconds int;
alter table building_types add column if not exists base_build_seconds int;
update recipes        set base_duration_seconds = duration_seconds where base_duration_seconds is null;
update building_types set base_build_seconds    = build_seconds    where base_build_seconds is null;

do $$
declare mult int := 10;   -- <<< change this number to make timers longer or shorter
begin
  update recipes set duration_seconds = base_duration_seconds * mult;
  update building_types set build_seconds = base_build_seconds * mult where slug not in ('apple-orchard', 'grocery-store');
end $$;

create or replace function upgrade_seconds(p_build_seconds int, p_level int)
returns int language sql immutable as $$ select greatest(p_build_seconds, 600) * p_level $$;

create or replace function start_production(p_building uuid, p_recipe int, p_runs int default 1)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare comp uuid; tut boolean; b buildings%rowtype; rc recipes%rowtype; i recipe_inputs%rowtype; fin timestamptz; cap int; secs int;
begin
  select id, tutorial_done into comp, tut from companies where owner_id = auth.uid() for update;
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
  cap := greatest(b.level, 1);
  for i in select * from recipe_inputs where recipe_id = rc.id loop
    update inventory set quantity = quantity - i.qty * p_runs * cap
      where company_id = comp and resource_id = i.resource_id and quantity >= i.qty * p_runs * cap;
    if not found then
      raise exception 'Not enough % in your warehouse (need %)', (select name from resources where id = i.resource_id), i.qty * p_runs * cap;
    end if;
  end loop;
  secs := case when coalesce(tut, false) then coalesce(rc.base_duration_seconds, rc.duration_seconds) else rc.duration_seconds end;
  fin := now() + make_interval(secs => secs * p_runs);
  insert into production_jobs (building_id, recipe_id, runs, finish_at, capacity) values (b.id, rc.id, p_runs, fin, cap);
  return fin;
end $$;
