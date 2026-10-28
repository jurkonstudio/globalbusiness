-- Global Business: stage 1 schema

create table companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null unique,
  cash numeric(14,2) not null default 100000,
  level int not null default 1,
  created_at timestamptz not null default now()
);

create table resources (
  id serial primary key,
  slug text unique not null,
  name text not null,
  base_price numeric(12,2) not null default 1
);

create table building_types (
  id serial primary key,
  slug text unique not null,
  name text not null,
  build_cost numeric(12,2) not null default 0
);

create table buildings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  type_id int not null references building_types(id),
  level int not null default 1,
  created_at timestamptz not null default now()
);

create table inventory (
  company_id uuid references companies(id) on delete cascade,
  resource_id int references resources(id),
  quantity numeric(14,2) not null default 0,
  primary key (company_id, resource_id)
);

-- Map: empty slots, filled in later
create table map_regions (
  id serial primary key,
  name text not null
);

create table map_slots (
  id serial primary key,
  region_id int references map_regions(id),
  x int not null,
  y int not null,
  company_id uuid references companies(id),
  unique (x, y)
);

-- Row Level Security
alter table companies enable row level security;
alter table buildings enable row level security;
alter table inventory enable row level security;
alter table resources enable row level security;
alter table building_types enable row level security;
alter table map_regions enable row level security;
alter table map_slots enable row level security;

create policy "own company" on companies for select using (owner_id = auth.uid());
create policy "own buildings" on buildings for select
  using (company_id in (select id from companies where owner_id = auth.uid()));
create policy "own inventory" on inventory for select
  using (company_id in (select id from companies where owner_id = auth.uid()));
create policy "public resources" on resources for select using (true);
create policy "public building types" on building_types for select using (true);
create policy "public regions" on map_regions for select using (true);
create policy "public slots" on map_slots for select using (true);

-- Server-side game logic
create or replace function create_company(company_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into companies (owner_id, name) values (auth.uid(), company_name)
  returning id into new_id;
  return new_id;
end $$;
