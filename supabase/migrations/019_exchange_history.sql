-- Global Business: migration 019 (run after 017 and 018, safe to re-run)
-- Exchange, part 1: a real trade history, seller names on the market, and price data for charts.
--   * trades: one row per executed purchase (price, qty, buyer, seller, time).
--   * market_orders.seller_name: shown on Listings, so players see who they trade with.
--   * exchange_price_history(): hourly OHLC + volume for Price Charts.
--   * exchange_recent_trades(): latest trades for the Trades page.
-- Names are copied into the rows when they are written, so public reads never need companies (which stay private).
-- Trades before this migration are not backfilled.

-- ===== 1) Seller names on orders =====
alter table market_orders add column if not exists seller_name text;

create or replace function set_order_seller_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select name into new.seller_name from companies where id = new.seller_id;
  return new;
end $$;

drop trigger if exists market_orders_seller_name on market_orders;
create trigger market_orders_seller_name
  before insert on market_orders
  for each row execute function set_order_seller_name();

update market_orders m set seller_name = c.name
  from companies c where c.id = m.seller_id and m.seller_name is null;

-- ===== 2) Trade history =====
create table if not exists trades (
  id bigserial primary key,
  resource_id int not null references resources(id),
  qty numeric(14,2) not null check (qty > 0),
  price numeric(12,4) not null check (price > 0),
  amount numeric(14,2) not null check (amount > 0),
  buyer_name text,
  seller_name text,
  order_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists trades_resource_time_idx on trades (resource_id, created_at desc);

alter table trades enable row level security;
drop policy if exists "public trades" on trades;
create policy "public trades" on trades for select using (true);
-- No insert/update/delete policy: rows are written only by buy_from_exchange below.

-- ===== 3) buy_from_exchange: same behaviour as 008, plus one trade row =====
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
  insert into trades (resource_id, qty, price, amount, buyer_name, seller_name, order_id)
    values (o.resource_id, p_qty, o.price, cost, c.name, o.seller_name, o.id);
  if p_qty = o.qty then delete from market_orders where id = o.id;
  else update market_orders set qty = qty - p_qty where id = o.id; end if;
  return cost;
end $$;
grant execute on function buy_from_exchange(uuid, numeric) to authenticated;
revoke execute on function buy_from_exchange(uuid, numeric) from public, anon;

-- ===== 4) Read functions for the UI =====
-- Hourly candles for one resource. Empty hours are skipped; the chart draws gaps.
create or replace function exchange_price_history(p_resource int, p_hours int default 168)
returns table (bucket timestamptz, open numeric, high numeric, low numeric, close numeric, volume numeric, trades int)
language sql stable security definer set search_path = public as $$
  select date_trunc('hour', t.created_at) as bucket,
         (array_agg(t.price order by t.created_at asc))[1] as open,
         max(t.price) as high,
         min(t.price) as low,
         (array_agg(t.price order by t.created_at desc))[1] as close,
         sum(t.qty) as volume,
         count(*)::int as trades
  from trades t
  where t.resource_id = p_resource
    and t.created_at >= now() - make_interval(hours => least(greatest(p_hours, 1), 720))
  group by 1
  order by 1
$$;
grant execute on function exchange_price_history(int, int) to anon, authenticated;

-- Latest trades, optionally for one resource.
create or replace function exchange_recent_trades(p_resource int default null, p_limit int default 50)
returns table (id bigint, resource_slug text, qty numeric, price numeric, amount numeric,
               buyer_name text, seller_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, r.slug, t.qty, t.price, t.amount, t.buyer_name, t.seller_name, t.created_at
  from trades t join resources r on r.id = t.resource_id
  where p_resource is null or t.resource_id = p_resource
  order by t.created_at desc, t.id desc
  limit least(greatest(p_limit, 1), 200)
$$;
grant execute on function exchange_recent_trades(int, int) to anon, authenticated;

-- Check: trades should be empty right after running this, and seller names should fill for existing orders.
select count(*) as trades_rows, (select count(*) from market_orders where seller_name is null) as orders_without_name from trades;
