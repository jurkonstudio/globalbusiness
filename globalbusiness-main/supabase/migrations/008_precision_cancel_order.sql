-- Global Business: migration 008 (run after 007, safe to re-run)
-- 1) Quantity/price precision is validated on every buy/list RPC (max 2 decimals, no zero-cost trades).
-- 2) cancel_exchange_order returns the unsold stock to the seller.
-- 3) Exchange trades now go through the ledger (apply_cash).
-- Not touched here: exchange UI, price history, deadlock-safe lock ordering.

-- Ledger: allow exchange kinds
alter table transactions drop constraint if exists transactions_kind_check;
alter table transactions add constraint transactions_kind_check
  check (kind in ('npc_buy','npc_sell','build','upgrade','freight','mission','exchange_buy','exchange_sell'));

-- ===== NPC buy: whole-unit minimum, 2-decimal precision, no free goods =====
create or replace function buy_from_npc(p_resource int, p_qty numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; r resources%rowtype; mk numeric; cost numeric;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  select * into r from resources where id = p_resource and npc_sells;
  if not found then raise exception 'The NPC does not sell this'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 100000 then raise exception 'Invalid quantity'; end if;
  if p_qty <> round(p_qty, 2) then raise exception 'Quantity may have at most 2 decimals'; end if;
  select npc_markup into mk from economy where id = 1;
  cost := round(r.base_price * coalesce(mk, 1.5) * p_qty, 2);
  if cost <= 0 then raise exception 'Amount too small'; end if;
  if c.cash < cost then raise exception 'Not enough cash'; end if;
  perform apply_cash(c.id, -cost, 'npc_buy', r.id, p_qty, r.slug);
  perform add_stock(c.id, r.id, p_qty);
  return cost;
end $$;

-- ===== Exchange: list =====
create or replace function list_on_exchange(p_resource int, p_qty numeric, p_price numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare comp uuid; oid uuid;
begin
  select id into comp from companies where owner_id = auth.uid() for update;
  if comp is null then raise exception 'Create a company first'; end if;
  if not exists (select 1 from resources where id = p_resource) then raise exception 'Unknown resource'; end if;
  if p_qty is null or p_qty < 0.01 or p_qty > 100000 then raise exception 'Invalid quantity'; end if;
  if p_price is null or p_price < 0.01 or p_price > 1000000 then raise exception 'Invalid price'; end if;
  if p_qty <> round(p_qty, 2) then raise exception 'Quantity may have at most 2 decimals'; end if;
  if p_price <> round(p_price, 2) then raise exception 'Price may have at most 2 decimals'; end if;
  update inventory set quantity = quantity - p_qty
    where company_id = comp and resource_id = p_resource and quantity >= p_qty;
  if not found then raise exception 'Not enough stock'; end if;
  insert into market_orders (seller_id, resource_id, qty, price) values (comp, p_resource, p_qty, p_price)
    returning id into oid;
  return oid;
end $$;

-- ===== Exchange: cancel (returns the remaining stock; a second call fails safely) =====
create or replace function cancel_exchange_order(p_order uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare comp uuid; o market_orders%rowtype;
begin
  select id into comp from companies where owner_id = auth.uid() for update;
  if comp is null then raise exception 'Create a company first'; end if;
  select * into o from market_orders where id = p_order and seller_id = comp for update;
  if not found then raise exception 'Order not found'; end if;
  perform add_stock(comp, o.resource_id, o.qty);
  delete from market_orders where id = o.id;
  return o.qty;
end $$;
revoke execute on function cancel_exchange_order(uuid) from public, anon;
grant execute on function cancel_exchange_order(uuid) to authenticated;

-- ===== Exchange: buy (precision + ledger on both sides) =====
create or replace function buy_from_exchange(p_order uuid, p_qty numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare c companies%rowtype; o market_orders%rowtype; cost numeric;
begin
  select * into c from companies where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a company first'; end if;
  select * into o from market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.seller_id = c.id then raise exception 'You cannot buy your own order'; end if;
  if p_qty is null or p_qty < 0.01 or p_qty > o.qty then raise exception 'Invalid quantity'; end if;
  if p_qty <> round(p_qty, 2) then raise exception 'Quantity may have at most 2 decimals'; end if;
  cost := round(p_qty * o.price, 2);
  if cost <= 0 then raise exception 'Amount too small'; end if;
  if c.cash < cost then raise exception 'Not enough cash'; end if;
  perform apply_cash(c.id, -cost, 'exchange_buy', o.resource_id, p_qty, o.id::text);
  perform apply_cash(o.seller_id, cost, 'exchange_sell', o.resource_id, p_qty, o.id::text);
  perform add_stock(c.id, o.resource_id, p_qty);
  if p_qty = o.qty then delete from market_orders where id = o.id;
  else update market_orders set qty = qty - p_qty where id = o.id; end if;
  return cost;
end $$;
