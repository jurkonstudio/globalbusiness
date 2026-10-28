-- 018_cement_consumer.sql
insert into recipe_inputs (recipe_id, resource_id, qty)
select rc.id, r.id, 1
from recipes rc
join building_types b on b.id = rc.building_type_id and b.slug = 'machine-shop'
join resources ro on ro.id = rc.output_resource_id and ro.slug = 'machinery'
join resources r on r.slug = 'cement'
on conflict (recipe_id, resource_id) do update set qty = excluded.qty;
