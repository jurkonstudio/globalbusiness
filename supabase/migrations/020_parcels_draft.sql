-- Global Business: migration 020 (DRAFT, not yet run). Parcel land model.
-- Land belongs to each company. A parcel is split into sub-plots (subdivisions). A building sits on ONE sub-plot
-- (sub_plot_index), or takes the WHOLE parcel (sub_plot_index null). One-to-many: parcel -> buildings.
-- Home Isle = 6 parcels: 2 farm (6 sub-plots each), 2 shop (3 each), 2 industry (3 each) = 24 sub-plots,
-- the same 24 places the old slots gave, so every existing building keeps its exact place.
-- Legacy buildings.slot stays for now; drop it in a later migration once the app only uses parcels.
-- Run after 019. Take a baseline backup first (supabase/ops/M0_baseline_and_backup.sql).

-- ===== 1) Parcels per company and region =====
create table if not exists parcels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  region_id text not null references regions(id),
  parcel_index int not null check (parcel_index >= 0),
  kind text not null check (kind in ('farm', 'shop', 'industry')),
  subdivisions int not null check (subdivisions between 1 and 6),
  unique (company_id, region_id, parcel_index)
);
alter table parcels enable row level security;
drop policy if exists "own parcels" on parcels;
create policy "own parcels" on parcels for select
  using (company_id in (select id from companies where owner_id = auth.uid()));

-- Home Isle layout. Idempotent: safe to call again.
create or replace function seed_home_parcels(p_company uuid) returns void
language sql security definer set search_path = public as $$
  insert into parcels (company_id, region_id, parcel_index, kind, subdivisions) values
    (p_company, 'home', 0, 'farm', 6),     (p_company, 'home', 1, 'farm', 6),
    (p_company, 'home', 2, 'shop', 3),     (p_company, 'home', 3, 'shop', 3),
    (p_company, 'home', 4, 'industry', 3), (p_company, 'home', 5, 'industry', 3)
  on conflict (company_id, region_id, parcel_index) do nothing;
$$;
revoke execute on function seed_home_parcels(uuid) from public, anon, authenticated;

create or replace function companies_seed_parcels() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform seed_home_parcels(new.id);
  return new;
end $$;
drop trigger if exists companies_seed_parcels on companies;
create trigger companies_seed_parcels after insert on companies
  for each row execute function companies_seed_parcels();

-- Existing companies get their parcels now.
select seed_home_parcels(id) from companies;

-- ===== 2) Map legacy slots to parcel + sub-plot (home only) =====
create or replace function home_parcel_index(p_slot int) returns int
language sql immutable as $$
  select case when p_slot < 12 then p_slot / 6 when p_slot < 18 then 2 + (p_slot - 12) / 3 else 4 + (p_slot - 18) / 3 end
$$;
create or replace function home_sub_index(p_slot int) returns int
language sql immutable as $$
  select case when p_slot < 12 then p_slot % 6 else (p_slot - 12) % 3 end
$$;

-- ===== 3) Buildings: one-to-many from parcels =====
alter table buildings add column if not exists parcel_id uuid references parcels(id);
alter table buildings add column if not exists sub_plot_index int check (sub_plot_index between 0 and 5);

update buildings b
   set parcel_id = p.id,
       sub_plot_index = home_sub_index(b.slot)
  from parcels p
 where b.region_id = 'home'
   and b.slot is not null
   and b.parcel_id is null
   and p.company_id = b.company_id
   and p.region_id = 'home'
   and p.parcel_index = home_parcel_index(b.slot);

-- One product per sub-plot.
create unique index if not exists buildings_subplot_uq
  on buildings (parcel_id, sub_plot_index) where parcel_id is not null and sub_plot_index is not null;

-- A whole-parcel building (sub_plot_index null) must be alone in its parcel.
create or replace function buildings_check_parcel() returns trigger
language plpgsql as $$
begin
  if new.parcel_id is null then return new; end if;
  if exists (select 1 from buildings b
             where b.parcel_id = new.parcel_id and b.id <> new.id
               and (new.sub_plot_index is null or b.sub_plot_index is null)) then
    raise exception 'That parcel is already in use';
  end if;
  return new;
end $$;
drop trigger if exists buildings_check_parcel on buildings;
create trigger buildings_check_parcel before insert or update of parcel_id, sub_plot_index on buildings
  for each row execute function buildings_check_parcel();

-- ===== 4) Build on a parcel =====
-- Zone rules match plot_kind() in 015/017. Livestock is its own category and is allowed on farm parcels (assumption).
create or replace function build_on_parcel(p_type_slug text, p_parcel_index int, p_sub int default null, p_region text default 'home')
returns uuid language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; t building_types%rowtype; rg regions%rowtype; pc parcels%rowtype;
        new_id uuid; ab numeric; cost numeric; ok boolean;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  select * into t from building_types where slug = p_type_slug;
  if not found then raise exception 'Unknown building type'; end if;
  select * into rg from regions where id = coalesce(p_region, 'home');
  if not found then raise exception 'Unknown region'; end if;
  if c.level < rg.unlock_level then raise exception '% unlocks at company level %', rg.name, rg.unlock_level; end if;
  if rg.id = 'home' then perform seed_home_parcels(c.id); end if;

  select * into pc from parcels where company_id = c.id and region_id = rg.id and parcel_index = p_parcel_index;
  if not found then raise exception 'Choose a parcel'; end if;
  if p_sub is not null and (p_sub < 0 or p_sub >= pc.subdivisions) then raise exception 'Choose a sub-plot in this parcel'; end if;
  if exists (select 1 from buildings b where b.parcel_id = pc.id
             and (p_sub is null or b.sub_plot_index is null or b.sub_plot_index = p_sub)) then
    raise exception 'That space is already used';
  end if;

  ok := case pc.kind when 'farm' then t.category in ('agriculture', 'livestock')
                     when 'shop' then t.category = 'retail'
                     else t.category in ('utility', 'extraction', 'construction', 'manufacturing') end;
  if not ok then raise exception 'This is a % parcel, % cannot be built here', pc.kind, t.name; end if;
  if c.level < t.unlock_level then raise exception 'Requires company level %', t.unlock_level; end if;
  cost := t.build_cost + rg.distance * 500;
  if c.cash < cost then raise exception 'Not enough cash (need $%)', cost; end if;
  if t.has_abundance then ab := round((70 + random() * 25)::numeric, 2); end if;
  perform apply_cash(c.id, -cost, 'build', null, null, t.slug || '@' || rg.id);
  update companies set xp = xp + 50, level = greatest(level, (xp + 50) / 100) where id = c.id;
  insert into buildings (company_id, type_id, abundance, region_id, parcel_id, sub_plot_index, build_finish_at)
    values (c.id, t.id, ab, rg.id, pc.id, p_sub,
            case when t.build_seconds > 0 then now() + make_interval(secs => t.build_seconds) end)
    returning id into new_id;
  return new_id;
end $$;
grant execute on function build_on_parcel(text, int, int, text) to authenticated;
revoke execute on function build_on_parcel(text, int, int, text) from public, anon;

-- After the app uses build_on_parcel, stop the slot-based path:
-- revoke execute on function build_building(text, int, text) from authenticated;
