-- Global Business: M0 "baseline and backup" (READ-ONLY: every query below is a plain SELECT)
-- This is NOT a migration. Do not put it in supabase/migrations/.
--
-- How to use (works from a phone): open Supabase > SQL Editor, paste ONE block at a time
-- (from its "-- Q..." line to the semicolon), press Run, read or export the result.
-- Keep the numbers from Q1 and the CSV files: they are your "before" picture for every later migration.
--
--   Q1       baseline numbers (row counts, total cash, ledger gap)              -> write the row down
--   Q2       function privileges: did migration 009 take effect?                -> first row must say 'ok'
--   Q3       pre-checks for migration 012 (all three numbers must be 0)
--   Q4       per-company cash vs ledger (needed later for the opening balance)
--   Q5 a-f   backup: one SELECT per table; in the result panel use the CSV download, then
--            compare each file's row count with Q1. Some dashboard versions cap the result
--            at a number of rows: if a file has fewer rows than Q1 says, raise the limit
--            or export in slices with "offset 0 / offset 1000 / ..." added to the query.
--
-- Suggested file names: m0_companies_YYYY-MM-DD.csv, m0_buildings_YYYY-MM-DD.csv, and so on.
-- Then run supabase/migrations/012_hardening.sql.


-- Q1 ---------------------------------------------------------------------------------------
select now() as taken_at,
       (select count(*) from companies)                              as companies,
       (select coalesce(sum(cash), 0) from companies)                as total_cash,
       (select count(*) from buildings)                              as buildings,
       (select count(*) from production_jobs)                        as production_jobs,
       (select count(*) from production_jobs where not collected)    as active_jobs,
       (select count(*) from inventory)                              as inventory_rows,
       (select coalesce(sum(quantity), 0) from inventory)            as total_stock_units,
       (select count(*) from transactions)                           as ledger_rows,
       (select coalesce(sum(amount), 0) from transactions)           as ledger_sum,
       (select coalesce(sum(cash), 0) from companies)
         - (select coalesce(sum(amount), 0) from transactions)       as cash_minus_ledger,   -- expected to be non-zero: no opening balance yet
       (select count(*) from market_orders)                          as market_orders,
       (select count(*) from company_missions)                       as claimed_missions;


-- Q2 ---------------------------------------------------------------------------------------
-- Effective EXECUTE rights (includes the implicit PUBLIC grant) of the roles the browser uses.
-- Expected: anon can run nothing; authenticated can run exactly the 22 game functions,
-- not the 5 internal helpers. Failures sort first, so the first row tells the story.
with expected(sig, player) as (values
  ('create_company(text)', true), ('rename_company(text)', true),
  ('build_building(text,integer,text)', true), ('plant_apples(integer)', true), ('upgrade_building(uuid)', true),
  ('buy_from_npc(integer,numeric)', true), ('sell_to_npc(integer,numeric)', true),
  ('start_production(uuid,integer,integer)', true), ('collect_production(uuid)', true),
  ('list_on_exchange(integer,numeric,numeric)', true), ('cancel_exchange_order(uuid)', true),
  ('buy_from_exchange(uuid,numeric)', true),
  ('claim_mission(text)', true), ('mission_status()', true),
  ('sync_progress()', true), ('welcome_back()', true), ('touch_seen()', true),
  ('should_prompt_save()', true), ('mark_save_prompted()', true), ('region_activity()', true),
  ('upgrade_cost(numeric,integer)', true), ('upgrade_seconds(integer,integer)', true),
  ('apply_cash(uuid,numeric,text,integer,numeric,text)', false), ('add_stock(uuid,integer,numeric)', false),
  ('settle_buildings(uuid)', false), ('mission_done(uuid,text)', false), ('handle_new_user()', false)
), actual as (
  select p.oid, p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- skip extension functions
), checked as (
  select a.sig,
         has_function_privilege('anon', a.oid, 'execute')          as anon_can_run,
         has_function_privilege('authenticated', a.oid, 'execute') as authenticated_can_run,
         e.player                                                  as authenticated_should_run,
         case when e.sig is null then 'UNKNOWN FUNCTION (not in the allowlist)'
              when has_function_privilege('anon', a.oid, 'execute') then 'FAIL: anon can run it'
              when has_function_privilege('authenticated', a.oid, 'execute') <> e.player then 'FAIL: authenticated rights are wrong'
              else 'ok' end                                        as status
    from actual a left join expected e on e.sig = a.sig
)
select * from checked order by status = 'ok', sig;
-- If anything says FAIL, run supabase/migrations/009_function_privileges.sql (safe to re-run), then run Q2 again.


-- Q3 ---------------------------------------------------------------------------------------
-- Pre-checks for 012. Every number should be 0. A non-zero number does not break 012:
-- that one constraint/index is skipped with a warning and the rest is applied.
select 'inventory rows with quantity < 0' as check_name, count(*) as bad_rows
  from inventory where quantity < 0
union all
select 'companies with cash < 0', count(*)
  from companies where cash < 0
union all
select 'buildings with more than one active job', count(*)
  from (select building_id from production_jobs where not collected group by building_id having count(*) > 1) d;


-- Q4 ---------------------------------------------------------------------------------------
-- Per company: cash now, sum of the ledger, and the difference.
-- implied_opening = cash - ledger_sum is the balance the ledger never saw (the later "opening balance" row).
-- drift = TRUE means cash differs from the balance after the company's last ledger row,
-- i.e. some cash change did not go through the ledger. That needs investigating before M2.
select c.id, c.name, c.cash,
       coalesce(sum(t.amount), 0)                     as ledger_sum,
       c.cash - coalesce(sum(t.amount), 0)            as implied_opening,
       count(t.id)                                    as ledger_rows,
       l.balance_after                                as last_balance_after,
       (l.balance_after is not null and l.balance_after <> c.cash) as drift
  from companies c
  left join transactions t on t.company_id = c.id
  left join lateral (select balance_after from transactions x
                      where x.company_id = c.id order by x.id desc limit 1) l on true
 group by c.id, l.balance_after
 order by c.created_at;


-- Q5 (backup, one SELECT per table; run each, download the CSV) ----------------------------
-- Q5a
select * from companies order by created_at, id;

-- Q5b
select * from buildings order by created_at, id;

-- Q5c
select * from inventory order by company_id, resource_id;

-- Q5d
select * from production_jobs order by started_at, id;

-- Q5e
select * from transactions order by id;

-- Q5f
select * from company_missions order by company_id, mission_id;

-- Optional, only if you already have rows in it (Q1: market_orders > 0):
-- select * from market_orders order by created_at, id;
