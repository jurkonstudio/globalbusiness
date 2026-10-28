-- Global Business: migration 016 (run after 015)
-- Resource-based construction: building and upgrading now require physical materials.

-- ===== 1) Create Requirements Table =====
create table if not exists construction_requirements (
  building_type_id int not null references building_types(id) on delete cascade,
  target_level int not null default 1, -- 1 = to build, 2+ = to upgrade to that level
  resource_id int not null references resources(id),
  quantity numeric(10,2) not null,
  primary key (building_type_id, target_level, resource_id)
);
alter table construction_requirements enable row level security;
drop policy if exists "public construction requirements" on construction_requirements;
create policy "public construction requirements" on construction_requirements for select using (true);

-- ===== 2) Seed Initial Requirements (Example) =====
-- Apple Orchard (Level 1) needs 5 Planks (just an example, adjust as needed)
insert into construction_requirements (building_type_id, target_level, resource_id, quantity)
select b.id, 1, r.id, 5
from building_types b, resources r
where b.slug = 'apple-orchard' and r.slug = 'planks'
on conflict (building_type_id, target_level, resource_id) do update set quantity = excluded.quantity;

-- Grocery Store (Level 1) needs 20 Bricks and 10 Planks
insert into construction_requirements (building_type_id, target_level, resource_id, quantity)
select b.id, 1, r.id, 
       case when r.slug = 'bricks' then 20 when r.slug = 'planks' then 10 end
from building_types b, resources r
where b.slug = 'grocery-store' and r.slug in ('bricks', 'planks')
on conflict (building_type_id, target_level, resource_id) do update set quantity = excluded.quantity;

-- Water Reservoir (Level 1) needs 15 Bricks
insert into construction_requirements (building_type_id, target_level, resource_id, quantity)
select b.id, 1, r.id, 15
from building_types b, resources r
where b.slug = 'water-reservoir' and r.slug = 'bricks'
on conflict (building_type_id, target_level, resource_id) do update set quantity = excluded.quantity;

-- ===== 3) Override build_building =====
create or replace function build_building(p_type_slug text, p_slot int default null, p_region text default 'home')
returns uuid language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; t building_types%rowtype; rg regions%rowtype; new_id uuid; ab numeric; cost numeric; pk text; ok boolean;
        req record;
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
  pk := plot_kind(rg.id, p_slot);
  ok := case pk when 'farm' then t.category = 'agriculture'
                when 'shop' then t.category = 'retail'
                else t.category in ('utility', 'extraction', 'construction') end;
  if not ok then raise exception 'This is a % plot, % cannot be built here', pk, t.name; end if;
  if c.level < t.unlock_level then raise exception 'Requires company level %', t.unlock_level; end if;
  
  cost := t.build_cost + rg.distance * 500;
  if c.cash < cost then raise exception 'Not enough cash (need $%)', cost; end if;

  -- NEW: Check construction materials
  for req in select * from construction_requirements where building_type_id = t.id and target_level = 1 loop
    -- Try to deduct
    update inventory set quantity = quantity - req.quantity
      where company_id = c.id and resource_id = req.resource_id and quantity >= req.quantity;
    if not found then
      raise exception 'Not enough % in your warehouse to build %', (select name from resources where id = req.resource_id), t.name;
    end if;
  end loop;

  if t.has_abundance then ab := round((70 + random() * 25)::numeric, 2); end if;
  perform apply_cash(c.id, -cost, 'build', null, null, t.slug || '@' || rg.id);
  update companies set xp = xp + 50, level = greatest(level, (xp + 50) / 100) where id = c.id;
  
  insert into buildings (company_id, type_id, abundance, slot, region_id, build_finish_at)
    values (c.id, t.id, ab, p_slot, rg.id, case when t.build_seconds > 0 then now() + make_interval(secs => t.build_seconds) end)
    returning id into new_id;
  return new_id;
end $$;

-- ===== 4) Override upgrade_building =====
create or replace function upgrade_building(p_building uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; b buildings%rowtype; t building_types%rowtype; cost numeric; fin timestamptz; req record;
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

  -- NEW: Check upgrade materials based on target level
  for req in select * from construction_requirements where building_type_id = t.id and target_level = (b.level + 1) loop
    update inventory set quantity = quantity - req.quantity
      where company_id = c.id and resource_id = req.resource_id and quantity >= req.quantity;
    if not found then
      raise exception 'Not enough % to upgrade % to LVL %', (select name from resources where id = req.resource_id), t.name, (b.level + 1);
    end if;
  end loop;

  fin := now() + make_interval(secs => upgrade_seconds(t.build_seconds, b.level));
  perform apply_cash(c.id, -cost, 'upgrade', null, null, t.slug || ' LVL ' || b.level);
  update companies set xp = xp + 20, level = greatest(level, (xp + 20) / 100) where id = c.id;
  update buildings set upgrade_to = b.level + 1, upgrade_finish_at = fin where id = b.id;
  return fin;
end $$;

-- ===== 5) Update Frontend Permissions =====
grant execute on function build_building(text, int, text) to authenticated;
grant execute on function upgrade_building(uuid) to authenticated;
