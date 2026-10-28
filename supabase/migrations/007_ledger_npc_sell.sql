-- Global Business: migration 007 (run after 006, safe to re-run)
-- 1) Ledger: every cash movement is recorded in `transactions`.
-- 2) sell_to_npc: the first real way to earn cash from production.
-- 3) Freight no longer blocks harvesting: it is capped at the cash you have.
-- Not touched here (later stages): exchange RPCs, quantity precision on buy_from_npc.

-- ===== 1) Ledger =====
create table if not exists transactions (
  id bigserial primary key,
  company_id uuid not null references companies(id) on delete cascade,
  kind text not null check (kind in ('npc_buy','npc_sell','build','upgrade','freight','mission')),
  amount numeric(14,2) not null,            -- + income, - expense
  balance_after numeric(14,2) not null,
  resource_id int references resources(id),
  qty numeric(14,2),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists transactions_company_idx on transactions (company_id, created_at desc);
alter table transactions enable row level security;
drop policy if exists "own transactions" on transactions;
create policy "own transactions" on transactions for select
  using (company_id in (select id from companies where owner_id = auth.uid()));

-- Safety net: cash can never go negative (existing rows are not re-checked).
alter table companies drop constraint if exists companies_cash_nonneg;
alter table companies add constraint companies_cash_nonneg check (cash >= 0) not valid;

-- The ONLY place cash changes from now on. Caller must already hold the company row lock.
create or replace function apply_cash(p_company uuid, p_delta numeric, p_kind text,
                                      p_resource int default null, p_qty numeric default null, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare bal numeric;
begin
  update companies set cash = cash + p_delta where id = p_company returning cash into bal;
  if bal is null then raise exception 'Company not found'; end if;
  if p_delta <> 0 then
    insert into transactions (company_id, kind, amount, balance_after, resource_id, qty, note)
      values (p_company, p_kind, p_delta, bal, p_resource, p_qty, p_note);
  end if;
  return bal;
end $$;
revoke execute on function apply_cash(uuid, numeric, text, int, numeric, text) from public, anon, authenticated;

-- ===== 2) NPC buy price ratio (placeholder balance: tune freely) =====
-- NPC sells at base_price * npc_markup (1.5) and buys at base_price * npc_buy_ratio (0.6),
-- so buying from the NPC and selling back always loses money (no arbitrage).
alter table economy add column if not exists npc_buy_ratio numeric(4,2) not null default 0.6
  check (npc_buy_ratio > 0 and npc_buy_ratio < 1);

create or replace function sell_to_npc(p_resource int, p_qty numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; r resources%rowtype; ratio numeric; revenue numeric;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  select * into r from resources where id = p_resource;
  if not found then raise exception 'Unknown resource'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > 100000 then raise exception 'Invalid quantity'; end if;
  if p_qty <> round(p_qty, 2) then raise exception 'Quantity may have at most 2 decimals'; end if;
  select npc_buy_ratio into ratio from economy where id = 1;
  revenue := round(r.base_price * coalesce(ratio, 0.6) * p_qty, 2);
  update inventory set quantity = quantity - p_qty
    where company_id = c.id and resource_id = r.id and quantity >= p_qty;
  if not found then raise exception 'Not enough % in your warehouse', r.name; end if;
  perform apply_cash(c.id, revenue, 'npc_sell', r.id, p_qty, r.slug);
  return revenue;
end $$;
revoke execute on function sell_to_npc(int, numeric) from public, anon;
grant execute on function sell_to_npc(int, numeric) to authenticated;

-- ===== 3) Existing functions, now writing to the ledger (logic otherwise unchanged) =====
create or replace function buy_from_npc(p_resource int, p_qty numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; r resources%rowtype; mk numeric; cost numeric;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  select * into r from resources where id = p_resource and npc_sells;
  if not found then raise exception 'The NPC does not sell this'; end if;
  if p_qty <= 0 or p_qty > 100000 then raise exception 'Invalid quantity'; end if;
  select npc_markup into mk from economy where id = 1;
  cost := round(r.base_price * coalesce(mk, 1.5) * p_qty, 2);
  if c.cash < cost then raise exception 'Not enough cash'; end if;
  perform apply_cash(c.id, -cost, 'npc_buy', r.id, p_qty, r.slug);
  perform add_stock(c.id, r.id, p_qty);
  return cost;
end $$;

create or replace function build_building(p_type_slug text, p_slot int default null, p_region text default 'home')
returns uuid language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; t building_types%rowtype; rg regions%rowtype; new_id uuid; ab numeric; cost numeric;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  select * into t from building_types where slug = p_type_slug;
  if not found then raise exception 'Unknown building type'; end if;
  select * into rg from regions where id = coalesce(p_region, 'home');
  if not found then raise exception 'Unknown region'; end if;
  if c.level < rg.unlock_level then raise exception '% unlocks at company level %', rg.name, rg.unlock_level; end if;
  if p_slot is null or p_slot < 0 or p_slot >= rg.slots then raise exception 'Choose a land slot'; end if;
  if exists (select 1 from buildings where company_id = c.id and region_id = rg.id and slot = p_slot) then
    raise exception 'That slot is already used';
  end if;
  if c.level < t.unlock_level then raise exception 'Requires company level %', t.unlock_level; end if;
  cost := t.build_cost + rg.distance * 500;
  if c.cash < cost then raise exception 'Not enough cash (need $%)', cost; end if;
  if t.has_abundance then ab := round((70 + random() * 25)::numeric, 2); end if;
  perform apply_cash(c.id, -cost, 'build', null, null, t.slug || '@' || rg.id);
  update companies set xp = xp + 50, level = greatest(level, (xp + 50) / 100) where id = c.id;
  insert into buildings (company_id, type_id, abundance, slot, region_id, build_finish_at)
    values (c.id, t.id, ab, p_slot, rg.id, case when t.build_seconds > 0 then now() + make_interval(secs => t.build_seconds) end)
    returning id into new_id;
  return new_id;
end $$;

create or replace function upgrade_building(p_building uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; b buildings%rowtype; t building_types%rowtype; cost numeric; fin timestamptz;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  perform settle_buildings(c.id);
  select * into b from buildings where id = p_building and company_id = c.id for update;
  if not found then raise exception 'Building not found'; end if;
  select * into t from building_types where id = b.type_id;
  if b.build_finish_at is not null and b.build_finish_at > now() then raise exception 'Still under construction'; end if;
  if b.upgrade_finish_at is not null then raise exception 'Already upgrading'; end if;
  if b.level >= 6 then raise exception 'Maximum level reached'; end if;
  if exists (select 1 from production_jobs where building_id = b.id and not collected) then
    raise exception 'Collect or finish production before upgrading';
  end if;
  cost := upgrade_cost(t.build_cost, b.level);
  if c.cash < cost then raise exception 'Not enough cash (need $%)', cost; end if;
  fin := now() + make_interval(secs => upgrade_seconds(t.build_seconds, b.level));
  perform apply_cash(c.id, -cost, 'upgrade', null, null, t.slug || ' LVL ' || b.level);
  update companies set xp = xp + 20, level = greatest(level, (xp + 20) / 100) where id = c.id;
  update buildings set upgrade_to = b.level + 1, upgrade_finish_at = fin where id = b.id;
  return fin;
end $$;

create or replace function claim_mission(p_id text)
returns numeric language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; m missions%rowtype;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  if not c.tutorial_done then raise exception 'Finish the tutorial first'; end if;
  select * into m from missions where id = p_id;
  if not found then raise exception 'Unknown mission'; end if;
  if exists (select 1 from company_missions where company_id = c.id and mission_id = m.id) then
    raise exception 'Already claimed';
  end if;
  if not mission_done(c.id, m.id) then raise exception 'Mission not completed yet'; end if;
  insert into company_missions (company_id, mission_id) values (c.id, m.id);
  perform apply_cash(c.id, m.reward_cash, 'mission', null, null, m.id);
  update companies set xp = xp + m.reward_xp, level = greatest(level, (xp + m.reward_xp) / 100) where id = c.id;
  return m.reward_cash;
end $$;

-- Harvest: freight is capped at the cash on hand, so a harvest can never get stuck.
create or replace function collect_production(p_job uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare comp uuid; j production_jobs%rowtype; rc recipes%rowtype; b buildings%rowtype; bt building_types%rowtype;
        rg regions%rowtype; res resources%rowtype; amt numeric; fr numeric := 0; cash_now numeric;
begin
  select id, cash into comp, cash_now from companies where owner_id = auth.uid() for update;
  if comp is null then raise exception 'Create a company first'; end if;
  select * into j from production_jobs where id = p_job and not collected for update;
  if not found then raise exception 'Job not found'; end if;
  select * into b from buildings where id = j.building_id and company_id = comp;
  if not found then raise exception 'Not your building'; end if;
  if j.finish_at > now() then raise exception 'Production is not finished yet'; end if;
  select * into rc from recipes where id = j.recipe_id;
  select * into bt from building_types where id = b.type_id;
  select * into rg from regions where id = b.region_id;
  select * into res from resources where id = rc.output_resource_id;

  amt := round(rc.output_qty * j.runs * coalesce(b.abundance / 100, 1)
         * (1 + case when rg.bonus_category is not null and rg.bonus_category = bt.category then rg.bonus_pct else 0 end / 100.0), 2);
  fr := least(round(rg.distance * amt * coalesce(res.transport, 1) * 0.02, 2), cash_now);

  if fr > 0 then perform apply_cash(comp, -fr, 'freight', res.id, amt, rg.id); end if;
  perform add_stock(comp, rc.output_resource_id, amt);
  update production_jobs set collected = true where id = j.id;
  update companies set xp = xp + 10 * j.runs, level = greatest(level, (xp + 10 * j.runs) / 100) where id = comp;
  update companies set tutorial_done = true, xp = greatest(xp, 100), level = greatest(level, 1)
    where id = comp and not tutorial_done;
  return amt;
end $$;
