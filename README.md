# Global Business

A browser-based business and economy simulation game, inspired by *Sim Companies*.
Build companies, produce goods, trade on the market, and grow your empire.

> Status: early development. The map is a 3D archipelago (session 2): 5 regions, sea lanes, day/night, server-side timers.

## Tech Stack
- **Frontend:** HTML, CSS, vanilla JavaScript (ES modules), hosted on GitHub Pages
- **Backend:** Supabase free tier (Auth, Postgres, Row Level Security, RPC functions)

## Game Modules
Headquarters, Warehouse, Buildings, Marketplace, Exchange, Contracts, Executives,
Research, Retail, Banking, Map, Encyclopedia, Ranking, Messages, Settings.

## Project Structure
```
global-business/
├── index.html
├── src/
│   ├── main.js
│   ├── config/        # supabase config, module list
│   ├── core/          # router, supabase client
│   ├── components/    # shared UI
│   ├── styles/
│   └── pages/<module>/<section>.js
├── supabase/
│   ├── migrations/    # 001_init.sql ... 012_hardening.sql, run in numeric order
│   ├── ops/           # read-only SQL for checks and backups (not migrations)
│   └── seed.sql
└── docs/
```

## Setup
1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL Editor run every file in `supabase/migrations/` in numeric order (001 to 012). Before each new migration, take a baseline and backup with `supabase/ops/M0_baseline_and_backup.sql`. `seed.sql` is intentionally empty; all data is seeded by the migrations. In Authentication > Sign In / Providers, enable **Allow anonymous sign-ins**.
3. Put your Project URL and anon key in `src/config/supabase.js`.
4. Push to GitHub, then enable **Settings > Pages > Deploy from branch (main, root)**.

To run locally: `python3 -m http.server 8000` and open `http://localhost:8000`.

## Disclaimer
Global Business is an independent fan project. It is not affiliated with Sim Companies
and uses none of its assets.

## License
MIT
