# Architecture
- Frontend: static ES modules, hash router, hosted on GitHub Pages.
- Backend: Supabase (Auth, Postgres, RLS, RPC functions, pg_cron).
- Game logic lives in Postgres functions, never in the browser.
- Production uses `finish_at` timestamps instead of server loops.
