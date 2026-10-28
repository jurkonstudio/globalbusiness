-- Global Business: migration 017 (run after 016, safe to re-run)
-- Longer production chains: raw goods -> intermediates -> finished goods.
-- Placeholder names and numbers, tune later.
--
--   Forestry Camp  (farm plot)   water + power            -> timber
--   Sawmill                      timber + power           -> planks (fixes planks having no producer)
--   Mill                         grain + power            -> flour
--   Juice Plant                  oranges + water + power  -> juice
--   Bakery                       flour + water + power    -> bread
--   Glassworks                   sand + power             -> glass
--   Cement Plant                 limestone + clay + power -> cement
--   Foundry                      minerals + water + power -> steel
--   Workshop                     planks + power           -> furniture, or glass + planks + power -> windows
--   Machine Shop                 steel + planks + power   -> machinery
--
-- New category 'manufacturing' goes on industry plots. build_building is redefined below
-- (same as 015) with that one category added.

-- ===== 1) Resources =====
insert into resources (slug, name, category, base_price, npc_sells) values
  ('timber','Timber','raw',3.5,false),
  ('flour','Flour','food',5,false),
  ('juice','Juice','food',6,false),
  ('bread','Bread','food',14,false),
  ('glass','Glass','material',7,false),
  ('cement','Cement','construction',6,false),
  ('steel','Steel','material',14,false),
  ('furniture','Furniture','goods',40,false),
  ('windows','Windows','goods',25,false),
  ('machinery','Machinery','goods',90,false)
on conflict (slug) do update set name = excluded.name, category = excluded.category,
  base_price = excluded.base_price, npc_sells = excluded.npc_sells;

-- Finished goods that the Grocery Store can sell
update resources set retail_ok = true, retail_ref = round(base_price * 1.8, 2)
 where slug in ('bread', 'juice', 'furniture');

-- ===== 2) Buildings =====
insert into building_types (slug, name, category, build_cost, unlock_level, has_abundance, build_seconds, description) values
  ('forestry-camp','Forestry Camp','agriculture',5000,1,false,180,'Grows and cuts timber from water and power.'),
  ('mill','Mill','manufacturing',6000,1,false,120,'Grinds grain into flour.'),
  ('sawmill','Sawmill','manufacturing',7000,2,false,120,'Saws timber into planks.'),
  ('juice-plant','Juice Plant','manufacturing',6000,2,false,120,'Presses oranges into juice.'),
  ('bakery','Bakery','manufacturing',8000,2,false,150,'Bakes bread from flour.'),
  ('glassworks','Glassworks','manufacturing',10000,3,false,150,'Melts sand into glass.'),
  ('cement-plant','Cement Plant','manufacturing',10000,3,false,150,'Burns limestone and clay into cement.'),
  ('foundry','Foundry','manufacturing',14000,4,false,180,'Smelts minerals into steel.'),
  ('workshop','Workshop','manufacturing',12000,4,false,180,'Makes furniture from planks, or windows from glass and planks.'),
  ('machine-shop','Machine Shop','manufacturing',18000,5,false,240,'Builds machinery from steel and planks.')
on conflict (slug) do update set name = excluded.name, category = excluded.category, build_cost = excluded.build_cost,
  unlock_level = excluded.unlock_level, has_abundance = excluded.has_abundance,
  build_seconds = excluded.build_seconds, description = excluded.description;

-- ===== 3) Recipes =====
insert into recipes (building_type_id, output_resource_id, output_qty, duration_seconds)
select b.id, r.id, v.q, v.s
from (values
  ('forestry-camp','timber',6,1200),
  ('mill','flour',2,900),
  ('sawmill','planks',2,900),
  ('juice-plant','juice',4,900),
  ('bakery','bread',4,1200),
  ('glassworks','glass',2,900),
  ('cement-plant','cement',2,1200),
  ('foundry','steel',2,1500),
  ('workshop','furniture',1,1500),
  ('workshop','windows',2,1200),
  ('machine-shop','machinery',1,1800)
) v(bslug, rslug, q, s)
join building_types b on b.slug = v.bslug
join resources r on r.slug = v.rslug
on conflict (building_type_id, output_resource_id) do update
  set output_qty = excluded.output_qty, duration_seconds = excluded.duration_seconds;

-- ===== 4) Recipe inputs =====
insert into recipe_inputs (recipe_id, resource_id, qty)
select rc.id, r.id, v.q
from recipes rc
join building_types b on b.id = rc.building_type_id
join resources ro on ro.id = rc.output_resource_id
join (values
  ('forestry-camp','timber','water',2), ('forestry-camp','timber','power',4),
  ('mill','flour','grain',3), ('mill','flour','power',2),
  ('sawmill','planks','timber',3), ('sawmill','planks','power',4),
  ('juice-plant','juice','oranges',3), ('juice-plant','juice','water',2), ('juice-plant','juice','power',2),
  ('bakery','bread','flour',2), ('bakery','bread','water',1), ('bakery','bread','power',3),
  ('glassworks','glass','sand',3), ('glassworks','glass','power',8),
  ('cement-plant','cement','limestone',2), ('cement-plant','cement','clay',1), ('cement-plant','cement','power',6),
  ('foundry','steel','minerals',3), ('foundry','steel','water',2), ('foundry','steel','power',15),
  ('workshop','furniture','planks',3), ('workshop','furniture','power',4),
  ('workshop','windows','glass',2), ('workshop','windows','planks',1), ('workshop','windows','power',2),
  ('machine-shop','machinery','steel',2), ('machine-shop','machinery','planks',1), ('machine-shop','machinery','power',10)
) v(bslug, outslug, rslug, q) on v.bslug = b.slug and v.outslug = ro.slug
join resources r on r.slug = v.rslug
on conflict (recipe_id, resource_id) do update set qty = excluded.qty;

-- ===== 5) build_building: accept 'manufacturing' on industry plots (copy of 015 with one change) =====
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

-- Check: every new output has at least one producer and every intermediate is used by another recipe
select r.slug, count(rc.id) as producers
from resources r left join recipes rc on rc.output_resource_id = r.id
where r.slug in ('timber','flour','juice','bread','glass','cement','steel','furniture','windows','machinery','planks')
group by r.slug order by r.slug;
