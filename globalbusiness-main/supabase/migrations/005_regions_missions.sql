-- Global Business: 3D map session 2 + Sim Companies-style early game (run after 004, safe to re-run)
-- Adds: regions (archipelago), per-region land slots, region bonuses, freight, shared-world stats, missions.

-- ===== 1) Regions =====
create table if not exists regions (
  id text primary key,
  name text not null,
  blurb text,
  unlock_level int not null default 0,
  slots int not null default 12,
  distance int not null default 0,          -- freight distance from Home Isle
  bonus_category text,                      -- building category that gets the bonus here
  bonus_pct int not null default 0
);
alter table regions enable row level security;
drop policy if exists "public regions v2" on regions;
create policy "public regions v2" on regions for select using (true);

insert into regions (id, name, blurb, unlock_level, slots, distance, bonus_category, bonus_pct) values
  ('home',     'Home Isle',      'Your headquarters island. Safe, close, no freight.',          0, 24, 0, null,           0),
  ('verdant',  'Verdant Coast',  'Rich soil. Farms here yield more.',                           2, 12, 2, 'agriculture',  15),
  ('ironridge','Iron Ridge',     'Mountain range packed with ore and stone.',                   3, 12, 3, 'extraction',   15),
  ('meridian', 'Port Meridian',  'Busy harbour town. Cheaper construction output.',             4, 12, 3, 'construction', 15),
  ('sunspire', 'Sunspire Atoll', 'Sun and wind. Utilities run best here.',                      5, 12, 4, 'utility',      15)
on conflict (id) do update set name = excluded.name, blurb = excluded.blurb, unlock_level = excluded.unlock_level,
  slots = excluded.slots, distance = excluded.distance, bonus_category = excluded.bonus_category, bonus_pct = excluded.bonus_pct;

-- ===== 2) Buildings live in a region + slot =====
alter table buildings add column if not exists region_id text not null default 'home' references regions(id);
alter table buildings drop constraint if exists buildings_slot_check;
alter table buildings add constraint buildings_slot_check check (slot is null or slot >= 0);
drop index if exists buildings_slot_uq;
create unique index if not exists buildings_region_slot_uq on buildings (company_id, region_id, slot) where slot is not null;

-- ===== 3) Build (region aware). Remote land costs a fee of $500 per distance step. =====
drop function if exists build_building(text, int);
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
  insert into buildings (company_id, type_id, abundance, slot, region_id) values (c.id, t.id, ab, p_slot, rg.id)
    returning id into new_id;
  return new_id;
end $$;

-- ===== 4) Collect: region bonus on output, freight on remote regions =====
create or replace function collect_production(p_job uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare comp uuid; j production_jobs%rowtype; rc recipes%rowtype; b buildings%rowtype; bt building_types%rowtype;
        rg regions%rowtype; res resources%rowtype; amt numeric; fr numeric := 0; cash_now numeric;
begin
  select id, cash into comp, cash_now from companies where owner_id = auth.uid() for update;
  select * into j from production_jobs where id = p_job and not collected for update;
  if not found then raise exception 'Job not found'; end if;
  select * into b from buildings where id = j.building_id and company_id = comp;
  if not found then raise exception 'Not your building'; end if;
  if j.finish_at > now() then raise exception 'Production is not finished yet'; end if;
  select * into rc from recipes where id = j.recipe_id;
  select * into bt from building_types where id = b.type_id;
  select * into rg from regions where id = b.region_id;
  select * into res from resources where id = rc.output_resource_id;

  amt := round(rc.output_qty * j.runs * coalesce(b.abundance / 100, 1)
         * (1 + case when rg.bonus_category is not null and rg.bonus_category = bt.category then rg.bonus_pct else 0 end / 100.0), 2);
  fr := round(rg.distance * amt * coalesce(res.transport, 1) * 0.02, 2);
  if fr > cash_now then raise exception 'Not enough cash for freight ($%)', fr; end if;

  if fr > 0 then update companies set cash = cash - fr where id = comp; end if;
  perform add_stock(comp, rc.output_resource_id, amt);
  update production_jobs set collected = true where id = j.id;
  update companies set xp = xp + 10 * j.runs, level = greatest(level, (xp + 10 * j.runs) / 100) where id = comp;
  update companies set tutorial_done = true, xp = greatest(xp, 100), level = greatest(level, 1)
    where id = comp and not tutorial_done;
  return amt;
end $$;

-- ===== 5) Shared world: how busy is each region (counts only, no private data) =====
create or replace function region_activity()
returns table (region_id text, companies bigint, buildings bigint)
language sql security definer stable set search_path = public as $$
  select r.id, count(distinct b.company_id), count(b.id)
  from regions r left join buildings b on b.region_id = r.id
  group by r.id;
$$;
grant execute on function region_activity() to anon, authenticated;

-- ===== 6) Missions (guided goals with rewards, like a quest log) =====
create table if not exists missions (
  id text primary key,
  ord int not null,
  title text not null,
  descr text not null,
  reward_cash numeric(12,2) not null default 0,
  reward_xp int not null default 0
);
create table if not exists company_missions (
  company_id uuid references companies(id) on delete cascade,
  mission_id text references missions(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (company_id, mission_id)
);
alter table missions enable row level security;
alter table company_missions enable row level security;
drop policy if exists "public missions" on missions;
create policy "public missions" on missions for select using (true);
drop policy if exists "own missions" on company_missions;
create policy "own missions" on company_missions for select
  using (company_id in (select id from companies where owner_id = auth.uid()));

insert into missions (id, ord, title, descr, reward_cash, reward_xp) values
  ('name',       1, 'Make it yours',        'Give your company a real name (Headquarters).',            500, 20),
  ('water',      2, 'Water supply',         'Build a Water Reservoir.',                                 750, 30),
  ('power',      3, 'Keep the lights on',   'Build a Power Plant.',                                     750, 30),
  ('plantation', 4, 'Grow your farm',       'Build a Plantation.',                                      1000, 40),
  ('first_water',5, 'First delivery',       'Collect a batch of Water from your reservoir.',            500, 30),
  ('expand',     6, 'Cross the sea',        'Build in another region (unlocks at Level 2).',            2000, 80),
  ('five',       7, 'Small empire',         'Operate 5 buildings.',                                     2500, 100),
  ('level3',     8, 'Rising company',       'Reach company level 3.',                                   3000, 100)
on conflict (id) do update set ord = excluded.ord, title = excluded.title, descr = excluded.descr,
  reward_cash = excluded.reward_cash, reward_xp = excluded.reward_xp;

create or replace function mission_done(p_company uuid, p_id text)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare c companies%rowtype;
begin
  select * into c from companies where id = p_company;
  return case p_id
    when 'name'        then c.name !~ '^Company [0-9A-Za-z]{5,6}$'
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

create or replace function mission_status()
returns table (id text, ord int, title text, descr text, reward_cash numeric, reward_xp int, done boolean, claimed boolean)
language plpgsql security definer stable set search_path = public as $$
declare comp uuid;
begin
  select c.id into comp from companies c where c.owner_id = auth.uid();
  return query
    select m.id, m.ord, m.title, m.descr, m.reward_cash, m.reward_xp,
           mission_done(comp, m.id),
           exists (select 1 from company_missions x where x.company_id = comp and x.mission_id = m.id)
    from missions m order by m.ord;
end $$;
grant execute on function mission_status() to authenticated;

create or replace function claim_mission(p_id text)
returns numeric language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; m missions%rowtype;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  if not c.tutorial_done then raise exception 'Finish the tutorial first'; end if;
  select * into m from missions where id = p_id;
  if not found then raise exception 'Unknown mission'; end if;
  if exists (select 1 from company_missions where company_id = c.id and mission_id = m.id) then
    raise exception 'Already claimed';
  end if;
  if not mission_done(c.id, m.id) then raise exception 'Mission not completed yet'; end if;
  insert into company_missions (company_id, mission_id) values (c.id, m.id);
  update companies set cash = cash + m.reward_cash, xp = xp + m.reward_xp,
    level = greatest(level, (xp + m.reward_xp) / 100) where id = c.id;
  return m.reward_cash;
end $$;
grant execute on function claim_mission(text) to authenticated;
