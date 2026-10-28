-- Global Business: migration 010 (run after 009, safe to re-run)
-- Removes placeholder rows that the old seed.sql may have re-inserted after migration 002 deleted them.
-- Each row is removed only if nothing uses it, so no player data can be affected.

delete from building_types bt
 where bt.slug = 'lumber-mill'
   and not exists (select 1 from buildings b where b.type_id = bt.id)
   and not exists (select 1 from recipes r where r.building_type_id = bt.id);

delete from resources r
 where r.slug in ('wood', 'iron-ore')
   and not exists (select 1 from inventory i where i.resource_id = r.id and i.quantity > 0)
   and not exists (select 1 from recipes x where x.output_resource_id = r.id)
   and not exists (select 1 from recipe_inputs ri where ri.resource_id = r.id)
   and not exists (select 1 from market_orders m where m.resource_id = r.id)
   and not exists (select 1 from transactions t where t.resource_id = r.id);
