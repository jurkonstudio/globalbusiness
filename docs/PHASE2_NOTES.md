# Phase 2 notes

## Backend observations (NOT changed, for your decision)
1. `market_orders` is public but `companies` is readable only by its owner, so the Market cannot show seller names, only "Your order".
2. There is no trade history table. Market "Trades" and "Price charts/history" have no data source; sales only appear as `exchange_sell` rows in `transactions`.
3. Nothing stores asset value or periodic balances, so profit, net worth and trend charts are not possible yet.
4. `transactions` has no resource name for build/upgrade rows (only a note like `plantation@home`).
5. `buy_from_npc` requires quantity >= 1, while stock can be fractional (for example 2.5 apples after a harvest). Fractions can be sold but not bought.
6. Level math differs between migrations (002: `1 + xp/100`; 007: `greatest(level, xp/100)`). The "% to next level" in the UI assumes `xp % 100`; please confirm that is the intended rule.
7. Several `build_building` overloads exist across migrations 002, 003, 005, 006 and 007. Worth checking in Supabase that only the latest signature remains, to avoid ambiguous RPC calls.

## UI behaviour changes worth knowing
- Map "Idle buildings" no longer counts buildings whose production is finished but not collected (those are "ready", not idle).
- The menu button dot now means "production ready to collect".
- Warehouse > Transactions now shows goods movements only; the full cash ledger is under Finance > Cash ledger.
