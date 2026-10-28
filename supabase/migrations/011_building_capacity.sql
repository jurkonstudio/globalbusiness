-- Global Business: migration 011 (run after 010, safe to re-run)
-- Building level now means capacity: a level N building processes N times the inputs and yields N times the output
-- in the same time. Cost per unit is unchanged. The capacity is stored on the job when it starts,
-- so jobs already running keep their original size.

alter table production_jobs add column if not exists capacity int not null default 1 check (capacity >= 1);

create or replace function start_production(p_building uuid, p_recipe int, p_runs int default 1)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare comp uuid; b buildings%rowtype; rc recipes%rowtype; i recipe_inputs%rowtype; fin timestamptz; cap int;
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
  cap := greatest(b.level, 1);
  for i in select * from recipe_inputs where recipe_id = rc.id loop
    update inventory set quantity = quantity - i.qty * p_runs * cap
      where company_id = comp and resource_id = i.resource_id and quantity >= i.qty * p_runs * cap;
    if not found then
      raise exception 'Not enough % in your warehouse (need %)', (select name from resources where id = i.resource_id), i.qty * p_runs * cap;
    end if;
  end loop;
  fin := now() + make_interval(secs => rc.duration_seconds * p_runs);
  insert into production_jobs (building_id, recipe_id, runs, finish_at, capacity) values (b.id, rc.id, p_runs, fin, cap);
  return fin;
end $$;

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
  update companies set tutorial_done = true, xp = greatest(xp, 100), level = greatest(level, 1)
    where id = comp and not tutorial_done;
  return amt;
end $$;
-- (create or replace keeps the grants from migration 009)
