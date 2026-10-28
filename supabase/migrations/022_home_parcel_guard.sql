-- Global Business: migration 022 (run after 021 and the fixed 020; safe to re-run).
-- Phased parcel rollout:
--   * Home Isle builds ONLY through build_on_parcel() / plant_apples_on_parcel().
--   * Verdant Coast, Iron Ridge, Port Meridian and Sunspire Atoll keep using build_building() with land slots.
--   * Both functions stay active. build_building() is dropped only after every region uses parcels.
-- Why a guard: slot-built buildings have parcel_id null, so the parcel checks in 020 cannot see them.
-- Without this guard, build_building could put a second building on a Home Isle place that a
-- parcel building already uses.
-- Body below is the 017 version of build_building with ONE added check (marked).

create or replace function build_building(p_type_slug text, p_slot int default null, p_region text default 'home')
returns uuid language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; t building_types%rowtype; rg regions%rowtype; new_id uuid; ab numeric; cost numeric; pk text; ok boolean;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  select * into t from building_types where slug = p_type_slug;
  if not found then raise exception 'Unknown building type'; end if;
  select * into rg from regions where id = coalesce(p_region, 'home');
  if not found then raise exception 'Unknown region'; end if;
  -- ADDED in 022: Home Isle is parcel-based
  if rg.id = 'home' then raise exception 'Home Isle uses parcels: build with build_on_parcel'; end if;
  if c.level < rg.unlock_level then raise exception '% unlocks at company level %', rg.name, rg.unlock_level; end if;
  if p_slot is null or p_slot < 0 or p_slot >= rg.slots then raise exception 'Choose a land slot'; end if;
  if exists (select 1 from buildings where company_id = c.id and region_id = rg.id and slot = p_slot) then
    raise exception 'That slot is already used';
  end if;
  pk := plot_kind(rg.id, p_slot);
  ok := case pk when 'farm' then t.category = 'agriculture'
                when 'shop' then t.category = 'retail'
                else t.category in ('utility', 'extraction', 'construction', 'manufacturing') end;
  if not ok then raise exception 'This is a % plot, % cannot be built here', pk, t.name; end if;
  if c.level < t.unlock_level then raise exception 'Requires company level %', t.unlock_level; end if;
  cost := t.build_cost + rg.distance * 500;
  if c.cash < cost then raise exception 'Not enough cash (need $%)', cost; end if;
  if t.has_abundance then ab := round((70 + random() * 25)::numeric, 2); end if;
  perform apply_cash(c.id, -cost, 'build', null, null, t.slug || '@' || rg.id);
  update companies set xp = xp + 50, level = greatest(level, (xp + 50) / 100) where id = c.id;
  insert into buildings (company_id, type_id, abundance, slot, region_id, build_finish_at)
    values (c.id, t.id, ab, p_slot, rg.id, case when t.build_seconds > 0 then now() + make_interval(secs => t.build_seconds) end)
    returning id into new_id;
  return new_id;
end $$;
grant execute on function build_building(text, int, text) to authenticated;
revoke execute on function build_building(text, int, text) from public, anon;

-- plant_apples(int) is the old slot-based tutorial step. It builds on 'home', so it now fails by design;
-- the app calls plant_apples_on_parcel() for Home Isle instead.

-- ===== Checks =====
-- 1) Home buildings still without a parcel (should be 0 after 020's backfill).
select count(*) as home_without_parcel from buildings where region_id = 'home' and parcel_id is null;

-- 2) Non-home buildings must stay on slots (parcel_id null).
select count(*) as other_regions_with_parcel from buildings where region_id <> 'home' and parcel_id is not null;
