-- Global Business: migration 009 (run after 008, safe to re-run)
-- 1) Lock down EXECUTE rights on every function in `public`, then grant only what the game needs.
--    Players (including anonymous guests, who use the `authenticated` role) get the game RPCs.
--    Internal helpers (apply_cash, add_stock, settle_buildings, mission_done, handle_new_user) are NOT callable from the browser.
-- 2) create_company gets the same name validation as rename_company.
-- If any line fails, nothing is applied: fix the error and run again.

-- ===== 2) create_company: same rules as rename_company (3-30 chars), one company per user =====
create or replace function create_company(company_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare nm text := btrim(company_name); new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if nm is null or char_length(nm) < 3 or char_length(nm) > 30 then raise exception 'Name must be 3-30 characters'; end if;
  if exists (select 1 from companies where owner_id = auth.uid()) then raise exception 'You already have a company'; end if;
  insert into companies (owner_id, name) values (auth.uid(), nm) returning id into new_id;
  return new_id;
end $$;

-- ===== 1) Revoke everything, then grant the allowlist =====
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- skip extension functions
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

grant execute on function
  create_company(text), rename_company(text),
  build_building(text, int, text), plant_apples(int), upgrade_building(uuid),
  buy_from_npc(int, numeric), sell_to_npc(int, numeric),
  start_production(uuid, int, int), collect_production(uuid),
  list_on_exchange(int, numeric, numeric), cancel_exchange_order(uuid), buy_from_exchange(uuid, numeric),
  claim_mission(text), mission_status(),
  sync_progress(), welcome_back(), touch_seen(),
  should_prompt_save(), mark_save_prompted(), region_activity(),
  upgrade_cost(numeric, int), upgrade_seconds(int, int)
to authenticated;

-- RULE FOR FUTURE MIGRATIONS: every new function must end with an explicit
--   revoke execute on function ... from public, anon;   and, if players call it,
--   grant execute on function ... to authenticated;
