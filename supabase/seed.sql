insert into resources (slug, name, base_price) values
  ('wood', 'Wood', 2), ('iron-ore', 'Iron Ore', 3), ('water', 'Water', 1)
on conflict do nothing;

insert into building_types (slug, name, build_cost) values
  ('lumber-mill', 'Lumber Mill', 5000), ('mine', 'Mine', 8000)
on conflict do nothing;
