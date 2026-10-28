-- Global Business: migration 021 (run after 019; 020 stays a draft). Safe to re-run.
-- Take a baseline first: supabase/ops/M0_baseline_and_backup.sql
-- Fixes:
--   1) Stale build_building overloads (only build_building(text, int, text) is used by the game).
--   2) The level rule (level = xp / 100, never goes down) was repeated in ~14 functions.
--      It now lives in one trigger, so new functions cannot drift from it.

-- ===== 1) Remove stale overloads =====
drop function if exists build_building(text);
drop function if exists build_building(text, int);

-- ===== 2) One level rule =====
create or replace function level_for_xp(p_xp int)
returns int language sql immutable as $$
  select greatest(coalesce(p_xp, 0), 0) / 100
$$;
revoke execute on function level_for_xp(int) from public, anon;

create or replace function companies_sync_level()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.level := greatest(coalesce(old.level, 0), coalesce(new.level, 0), level_for_xp(new.xp));
  return new;
end $$;
revoke execute on function companies_sync_level() from public, anon, authenticated;

drop trigger if exists companies_sync_level on companies;
create trigger companies_sync_level
  before update of xp, level on companies
  for each row execute function companies_sync_level();

-- Reconcile existing companies (level may lag behind xp from older migrations)
update companies set level = level_for_xp(xp) where level < level_for_xp(xp);

-- ===== 3) Checks (expect: 1 row per function, 0 mismatches) =====
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('build_building','start_production','collect_production','upgrade_building',
                    'claim_mission','sync_progress','welcome_back','apply_cash')
order by p.proname;

select count(*) as level_mismatches from companies where level < level_for_xp(xp);
