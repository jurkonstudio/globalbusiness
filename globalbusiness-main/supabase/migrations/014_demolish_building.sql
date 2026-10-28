-- Global Business: migration 014 (run after 013, safe to re-run)
-- Demolish a building from the isometric map ("cabut bangunan").
--
--   * The land slot becomes free again and the building (with its store shelves) is deleted.
--   * Refund = 40% of everything the player paid for the building: build cost + every upgrade paid so far.
--     (Land fee is not refunded. A refund is always smaller than what was spent, so build/demolish can not be farmed.)
--   * Not allowed while the building is under construction, upgrading, or has a production job that has not been
--     collected yet. Not allowed during the tutorial (the tutorial needs the orchard and the store).
--   * Pending store sales are booked first, so no customer revenue is lost when a Grocery Store goes away.
--   Nothing existing is changed. production_jobs and store_listings are removed by their ON DELETE CASCADE.

-- ===== 1) Ledger: new kind =====
alter table transactions drop constraint if exists transactions_kind_check;
alter table transactions add constraint transactions_kind_check
  check (kind in ('npc_buy','npc_sell','build','upgrade','freight','mission','exchange_buy','exchange_sell','retail_sale','demolish'));

-- ===== 2) Refund rule (one place, immutable) =====
create or replace function demolish_value(p_build_cost numeric, p_level int)
returns numeric language sql immutable as $$
  select round((p_build_cost
    + coalesce((select sum(upgrade_cost(p_build_cost, l)) from generate_series(1, greatest(p_level, 1) - 1) as l), 0)) * 0.4)
$$;
revoke execute on function demolish_value(numeric, int) from public, anon;
grant execute on function demolish_value(numeric, int) to authenticated;

-- ===== 3) Player action =====
create or replace function demolish_building(p_building uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; b buildings%rowtype; t building_types%rowtype; refund numeric;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  if not c.tutorial_done then raise exception 'Finish the tutorial before demolishing buildings'; end if;
  perform settle_buildings(c.id);
  perform retail_settle(c.id);                      -- book pending store sales before a store can disappear
  select * into b from buildings where id = p_building and company_id = c.id for update;
  if not found then raise exception 'Building not found'; end if;
  select * into t from building_types where id = b.type_id;
  if b.build_finish_at is not null and b.build_finish_at > now() then raise exception 'Wait until construction finishes'; end if;
  if b.upgrade_finish_at is not null then raise exception 'Wait until the upgrade finishes'; end if;
  if exists (select 1 from production_jobs where building_id = b.id and not collected) then
    raise exception 'Collect or finish production before demolishing';
  end if;
  refund := demolish_value(t.build_cost, b.level);
  delete from buildings where id = b.id;
  perform apply_cash(c.id, refund, 'demolish', null, null, t.slug || ' LVL ' || b.level);
  return refund;
end $$;
revoke execute on function demolish_building(uuid) from public, anon;
grant execute on function demolish_building(uuid) to authenticated;

-- ===== 4) Result =====
select 'demolish_building()' as item,
       case when to_regprocedure('public.demolish_building(uuid)') is not null then 'ok' else 'MISSING' end as status;
