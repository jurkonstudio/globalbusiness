-- Global Business: migration 023 (run after 022, safe to re-run). Contracts, part 1.
-- A contract is a fixed-price, one-time trade between two named companies:
--   * The proposer offers to SELL or asks to BUY a quantity of one resource at a fixed unit price.
--   * The other company accepts or declines before the contract expires (1 h to 7 days, default 48 h).
--   * On accept the swap is atomic: goods leave the seller, cash leaves the buyer, nothing is held in escrow.
--     If the seller lacks stock or the buyer lacks cash at that moment, the accept fails and nothing moves.
-- Not in part 1 (later): recurring deliveries, escrow/reservation, quality, penalties.
-- Names are copied into the row (like 019) because `companies` stays private.

-- ===== 1) Table =====
create table if not exists trade_contracts (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references companies(id) on delete cascade,
  counterparty_id uuid not null references companies(id) on delete cascade,
  proposer_name text not null,
  counterparty_name text not null,
  proposer_role text not null check (proposer_role in ('seller', 'buyer')),
  resource_id int not null references resources(id),
  qty numeric(14,2) not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price > 0),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  check (proposer_id <> counterparty_id)
);
create index if not exists trade_contracts_proposer_idx on trade_contracts (proposer_id, created_at desc);
create index if not exists trade_contracts_counterparty_idx on trade_contracts (counterparty_id, created_at desc);

alter table trade_contracts enable row level security;
drop policy if exists "own trade_contracts" on trade_contracts;
create policy "own trade_contracts" on trade_contracts for select using (
  proposer_id in (select id from companies where owner_id = auth.uid())
  or counterparty_id in (select id from companies where owner_id = auth.uid()));
-- No insert/update/delete policy: rows are written only by the functions below.

-- ===== 2) Ledger kinds (keeps every earlier kind) =====
alter table transactions drop constraint if exists transactions_kind_check;
alter table transactions add constraint transactions_kind_check
  check (kind in ('npc_buy','npc_sell','build','upgrade','freight','mission','exchange_buy','exchange_sell',
                  'retail_sale','demolish','contract_buy','contract_sell'));

-- ===== 3) create_contract =====
create or replace function create_contract(p_to_name text, p_role text, p_resource int, p_qty numeric,
                                           p_price numeric, p_hours int default 48)
returns uuid language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; o companies%rowtype; r resources%rowtype; new_id uuid; nm text := btrim(p_to_name);
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  if nm is null or nm = '' then raise exception 'Enter the company name'; end if;
  if p_role is null or p_role not in ('seller', 'buyer') then raise exception 'Invalid role'; end if;
  select * into o from companies where lower(name) = lower(nm) order by (name = nm) desc limit 1;
  if not found then raise exception 'No company with that name'; end if;
  if o.id = c.id then raise exception 'You cannot make a contract with yourself'; end if;
  select * into r from resources where id = p_resource;
  if not found then raise exception 'Unknown resource'; end if;
  if p_qty is null or p_qty < 0.01 or p_qty > 100000 then raise exception 'Invalid quantity'; end if;
  if p_qty <> round(p_qty, 2) then raise exception 'Quantity may have at most 2 decimals'; end if;
  if p_price is null or p_price < 0.01 or p_price > 1000000 then raise exception 'Invalid price'; end if;
  if p_price <> round(p_price, 2) then raise exception 'Price may have at most 2 decimals'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 168 then raise exception 'Expiry must be between 1 and 168 hours'; end if;
  if (select count(*) from trade_contracts where proposer_id = c.id and status = 'pending' and expires_at > now()) >= 20 then
    raise exception 'You already have 20 open contract offers';
  end if;
  insert into trade_contracts (proposer_id, counterparty_id, proposer_name, counterparty_name, proposer_role,
                         resource_id, qty, unit_price, expires_at)
    values (c.id, o.id, c.name, o.name, p_role, r.id, p_qty, p_price, now() + make_interval(hours => p_hours))
    returning id into new_id;
  return new_id;
end $$;

-- ===== 4) respond_contract: the counterparty accepts or declines =====
-- Returns 'accepted', 'declined' or 'expired'.
create or replace function respond_contract(p_contract uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare me companies%rowtype; k trade_contracts%rowtype; r resources%rowtype; seller uuid; buyer uuid; total numeric;
begin
  select * into me from companies where owner_id = auth.uid();
  if not found then raise exception 'Create a company first'; end if;
  select * into k from trade_contracts where id = p_contract for update;
  if not found or k.counterparty_id <> me.id then raise exception 'Contract not found'; end if;
  if k.status <> 'pending' then raise exception 'This contract is no longer open'; end if;
  if k.expires_at <= now() then
    update trade_contracts set status = 'expired', resolved_at = now() where id = k.id;
    return 'expired';
  end if;
  if not coalesce(p_accept, false) then
    update trade_contracts set status = 'declined', resolved_at = now() where id = k.id;
    return 'declined';
  end if;

  -- Lock both companies in a fixed order to avoid deadlocks between two simultaneous trades.
  perform 1 from companies where id in (k.proposer_id, k.counterparty_id) order by id for update;
  seller := case k.proposer_role when 'seller' then k.proposer_id else k.counterparty_id end;
  buyer  := case k.proposer_role when 'seller' then k.counterparty_id else k.proposer_id end;
  total := round(k.qty * k.unit_price, 2);
  select * into r from resources where id = k.resource_id;

  update inventory set quantity = quantity - k.qty
    where company_id = seller and resource_id = k.resource_id and quantity >= k.qty;
  if not found then
    if me.id = seller then raise exception 'Not enough % in your warehouse', r.name; end if;
    raise exception 'The seller does not have enough % in stock right now', r.name;
  end if;
  if (select cash from companies where id = buyer) < total then
    if me.id = buyer then raise exception 'Not enough cash (need $%)', total; end if;
    raise exception 'The buyer does not have enough cash right now';
  end if;

  perform apply_cash(buyer, -total, 'contract_buy', k.resource_id, k.qty, k.id::text);
  perform apply_cash(seller, total, 'contract_sell', k.resource_id, k.qty, k.id::text);
  perform add_stock(buyer, k.resource_id, k.qty);
  update trade_contracts set status = 'accepted', resolved_at = now() where id = k.id;
  return 'accepted';
end $$;

-- ===== 5) cancel_contract: the proposer withdraws an open offer =====
create or replace function cancel_contract(p_contract uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me companies%rowtype; k trade_contracts%rowtype;
begin
  select * into me from companies where owner_id = auth.uid();
  if not found then raise exception 'Create a company first'; end if;
  select * into k from trade_contracts where id = p_contract for update;
  if not found or k.proposer_id <> me.id then raise exception 'Contract not found'; end if;
  if k.status <> 'pending' then raise exception 'This contract is no longer open'; end if;
  update trade_contracts set status = 'cancelled', resolved_at = now() where id = k.id;
end $$;

-- ===== 6) Privileges (rule from 009) =====
revoke execute on function create_contract(text, text, int, numeric, numeric, int) from public, anon;
revoke execute on function respond_contract(uuid, boolean) from public, anon;
revoke execute on function cancel_contract(uuid) from public, anon;
grant execute on function create_contract(text, text, int, numeric, numeric, int) to authenticated;
grant execute on function respond_contract(uuid, boolean) to authenticated;
grant execute on function cancel_contract(uuid) to authenticated;

-- ===== Checks =====
select 'trade_contracts table' as part, count(*) from information_schema.tables where table_name = 'trade_contracts'
union all
select 'functions', count(*) from pg_proc where proname in ('create_contract', 'respond_contract', 'cancel_contract');
