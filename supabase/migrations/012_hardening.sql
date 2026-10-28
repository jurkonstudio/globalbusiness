-- Global Business: migration 012 (run after 011, safe to re-run)
-- M1 "hardening". Nothing is deleted and no game logic, balance value or function body changes.
--   1) Players can no longer write to any table directly (all writes go through the RPC functions).
--   2) inventory.quantity >= 0 and companies.cash >= 0 become real, validated constraints.
--   3) At most one active (not collected) production job per building.
--   4) Indexes on the foreign keys and lookups the game already uses.
--
-- Before running: do M0 (supabase/ops/M0_baseline_and_backup.sql), at least Q1 (baseline) and Q3 (pre-checks).
-- If existing data would violate a constraint or the unique index, that one step is SKIPPED with a WARNING
-- instead of failing the whole file. The result table at the very end tells you what is in place.
-- Fix the data, then run this file again.

-- ===== 1) No direct writes from the browser roles =====
-- The game only writes through SECURITY DEFINER functions (they run as the table owner, so they are not affected).
-- SELECT stays as it is: Row Level Security still decides who can read what.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke usage, update on all sequences in schema public from anon, authenticated;

-- Tables created from now on (by this role) do not get write access for the browser roles either.
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public revoke usage, update on sequences from anon, authenticated;

-- ===== 2) Stock and cash can never go negative =====
-- Added as NOT VALID first (enforced for every new write at once), then validated only if existing rows are clean.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'inventory_quantity_nonneg' and conrelid = 'public.inventory'::regclass) then
    alter table public.inventory add constraint inventory_quantity_nonneg check (quantity >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'companies_cash_nonneg' and conrelid = 'public.companies'::regclass) then
    alter table public.companies add constraint companies_cash_nonneg check (cash >= 0) not valid;
  end if;

  if exists (select 1 from public.inventory where quantity < 0) then
    raise warning 'inventory has rows with quantity < 0: inventory_quantity_nonneg stays NOT VALID (new writes are still checked). Fix those rows, then run this file again.';
  else
    alter table public.inventory validate constraint inventory_quantity_nonneg;
  end if;

  if exists (select 1 from public.companies where cash < 0) then
    raise warning 'companies has rows with cash < 0: companies_cash_nonneg stays NOT VALID (new writes are still checked). Fix those rows, then run this file again.';
  else
    alter table public.companies validate constraint companies_cash_nonneg;
  end if;
end $$;

-- ===== 3) One active job per building =====
-- start_production already refuses a busy building; this makes the database refuse it too.
do $$
begin
  if exists (select 1 from public.production_jobs where not collected group by building_id having count(*) > 1) then
    raise warning 'Some building has more than one active production job: production_jobs_one_active_uq was NOT created. Resolve the duplicates, then run this file again.';
  else
    create unique index if not exists production_jobs_one_active_uq
      on public.production_jobs (building_id) where not collected;
  end if;
end $$;

-- ===== 4) Indexes =====
-- (The unique slot index on buildings starts with company_id but is partial, so it cannot serve plain company lookups.)
create index if not exists buildings_company_idx          on buildings (company_id);
create index if not exists buildings_region_idx           on buildings (region_id);
create index if not exists buildings_type_idx             on buildings (type_id);
create index if not exists production_jobs_building_idx   on production_jobs (building_id);
create index if not exists market_orders_seller_idx       on market_orders (seller_id);
create index if not exists market_orders_resource_price_idx on market_orders (resource_id, price);
create index if not exists inventory_resource_idx         on inventory (resource_id);

-- ===== Rollback (manual, only if something unexpected breaks; objects above are harmless to keep) =====
-- grant insert, update, delete, truncate, references, trigger on all tables in schema public to anon, authenticated;
-- alter table inventory drop constraint if exists inventory_quantity_nonneg;
-- drop index if exists production_jobs_one_active_uq;

-- ===== Result: what is in place now (this is the table the SQL Editor shows) =====
select 'constraint' as kind, e.name,
       case when c.oid is null then 'MISSING'
            when c.convalidated then 'ok (validated)'
            else 'NOT VALID: existing rows not yet checked' end as status
  from (values ('inventory_quantity_nonneg'), ('companies_cash_nonneg')) e(name)
  left join pg_constraint c on c.conname = e.name and c.connamespace = 'public'::regnamespace
union all
select 'index', e.name, case when i.indexname is null then 'MISSING' else 'ok' end
  from (values ('production_jobs_one_active_uq'), ('buildings_company_idx'), ('buildings_region_idx'),
               ('buildings_type_idx'), ('production_jobs_building_idx'), ('market_orders_seller_idx'),
               ('market_orders_resource_price_idx'), ('inventory_resource_idx')) e(name)
  left join pg_indexes i on i.schemaname = 'public' and i.indexname = e.name
union all
select 'direct table writes for anon/authenticated', 'tables in public',
       case when count(*) = 0 then 'ok (none)' else 'STILL OPEN: ' || count(*) || ' privileges' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) r(role_name)
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
 where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
   and has_table_privilege(r.role_name, c.oid, p.priv)
order by 1, 2;
