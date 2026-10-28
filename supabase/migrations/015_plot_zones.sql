-- Global Business: migration 015 (run after 014, safe to re-run)
-- Plot zones, Sim Companies style: every land plot has ONE kind and holds exactly ONE building.
--   farm      -> agriculture buildings (Apple Orchard, Plantation)
--   shop      -> retail buildings (Grocery Store), upgradable to level 6
--   industry  -> utility, extraction, construction
-- Home Isle (6 columns): rows 1-2 = farm (slots 0-11), row 3 = shop (12-17), row 4 = industry (18-23).
-- Verdant Coast = farm plots, every other island = industry plots.
-- Buildings that already exist stay where they are; only NEW construction is checked.
-- Keep this in sync with plotKind() in src/config/regions.js.

create or replace function plot_kind(p_region text, p_slot int)
returns text language sql immutable as $$
  select case
    when p_region = 'home' then case when p_slot / 6 in (0, 1) then 'farm' when p_slot / 6 = 2 then 'shop' else 'industry' end
    when p_region = 'verdant' then 'farm'
    else 'industry' end
$$;
grant execute on function plot_kind(text, int) to authenticated;
revoke execute on function plot_kind(text, int) from public, anon;

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
  if t.has_abundance then ab := round((70 + random() * 25)::numeric, 2); end if;
  perform apply_cash(c.id, -cost, 'build', null, null, t.slug || '@' || rg.id);
  update companies set xp = xp + 50, level = greatest(level, (xp + 50) / 100) where id = c.id;
  insert into buildings (company_id, type_id, abundance, slot, region_id, build_finish_at)
    values (c.id, t.id, ab, p_slot, rg.id, case when t.build_seconds > 0 then now() + make_interval(secs => t.build_seconds) end)
    returning id into new_id;
  return new_id;
end $$;
grant execute on function build_building(text, int, text) to authenticated;
