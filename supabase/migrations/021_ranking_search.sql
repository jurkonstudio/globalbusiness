-- Global Business: migration 021 (run after 019; independent of the 020 parcel draft; safe to re-run)
-- Real data for Ranking and Search. Two read-only functions. No table, no existing function and no player data is changed.
--
--   ranking_companies(scope, limit)  public ranking: more XP first, then higher level, then the older company.
--                                    scope 'registered' = only companies whose owner saved the account (not a guest).
--                                    The caller's own row is always included, even outside the top `limit`.
--   search_companies(text)           find companies by part of the name (name, level, XP, finished buildings, "is you").
--
-- Only these fields leave the database: name, level, XP, number of finished buildings. Cash, stock and the owner id are
-- never returned, because the companies table itself stays private (RLS from migration 001).
-- Before running: M0 (supabase/ops/M0_baseline_and_backup.sql, at least Q0).

create or replace function ranking_companies(p_scope text default 'all', p_limit int default 50)
returns table (pos bigint, name text, level int, xp int, buildings int, is_you boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_scope is null or p_scope not in ('all', 'registered') then raise exception 'Invalid scope'; end if;
  return query
  with ranked as (
    select row_number() over (order by c.xp desc, c.level desc, c.created_at, c.id) as rk,
           c.name as cname, c.level as clevel, c.xp as cxp,
           (select count(*)::int from buildings b
             where b.company_id = c.id and (b.build_finish_at is null or b.build_finish_at <= now())) as nb,
           (c.owner_id = auth.uid()) as me
      from companies c
      left join auth.users u on u.id = c.owner_id
     where p_scope = 'all' or coalesce(u.is_anonymous, false) = false
  )
  select r.rk, r.cname, r.clevel, r.cxp, r.nb, r.me
    from ranked r
   where r.rk <= least(greatest(coalesce(p_limit, 50), 1), 200) or r.me
   order by r.rk;
end $$;

create or replace function search_companies(p_query text)
returns table (name text, level int, xp int, buildings int, is_you boolean)
language plpgsql stable security definer set search_path = public as $$
declare q text := lower(btrim(coalesce(p_query, '')));
begin
  if length(q) < 2 then raise exception 'Enter at least 2 characters'; end if;
  if length(q) > 40 then raise exception 'Search text is too long'; end if;
  return query
  select c.name, c.level, c.xp,
         (select count(*)::int from buildings b
           where b.company_id = c.id and (b.build_finish_at is null or b.build_finish_at <= now())),
         (c.owner_id = auth.uid())
    from companies c
   where position(q in lower(c.name)) > 0
   order by (lower(c.name) = q) desc, c.xp desc, c.name
   limit 20;
end $$;

-- Signed-in players only (guests are signed in too). Never anon.
revoke execute on function ranking_companies(text, int) from public, anon;
revoke execute on function search_companies(text)       from public, anon;
grant  execute on function ranking_companies(text, int) to authenticated;
grant  execute on function search_companies(text)       to authenticated;

-- Hygiene for migration 019: set_order_seller_name() is a trigger function. Nobody calls it directly, and a trigger
-- fires without the inserting player needing EXECUTE, so closing it changes nothing in the game. Skipped if 019 is not installed.
do $$
begin
  if to_regprocedure('public.set_order_seller_name()') is not null then
    revoke execute on function set_order_seller_name() from public, anon, authenticated;
  end if;
end $$;

-- Rollback (manual): drop function if exists ranking_companies(text, int), search_companies(text);
--   (to reopen the trigger function: grant execute on function set_order_seller_name() to public;)

-- ===== Result: every row must say ok =====
select e.item, case when to_regprocedure('public.' || e.item) is not null then 'ok' else 'MISSING' end as status
  from (values ('ranking_companies(text,integer)'), ('search_companies(text)')) e(item)
union all
select 'ranking_companies is closed to anon',
       case when has_function_privilege('anon', 'public.ranking_companies(text,integer)', 'execute') then 'OPEN: check the revoke' else 'ok' end
union all
select 'migration 014 (demolish) installed',
       case when to_regprocedure('public.demolish_building(uuid)') is not null then 'ok' else 'NOT INSTALLED: run 014 for the Demolish button' end;
