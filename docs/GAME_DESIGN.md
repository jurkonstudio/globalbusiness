# Global Business: Game Design

Inspired by the mechanics of Sim Companies. Names and numbers here are original placeholders, tuned for balance later.

## Core loop
Buy inputs (NPC or exchange) -> produce in buildings -> collect into the warehouse -> sell (exchange, contracts, retail) -> reinvest -> level up.

## Economy
- **Phases:** Recession, Normal, Boom (table `economy`, shown in the top bar). Phases will shift on a schedule (pg_cron) and move prices and demand.
- **NPC suppliers:** sell Seeds, Power, Water, Bricks, Planks at a markup (`npc_markup`, default 1.5x base price) so players can undercut them. Implemented.
- **Exchange:** player-to-player market. Server functions done, UI next.

## Production (implemented)
- Each building produces one recipe at a time. Inputs are consumed at start, output is added when collected.
- Time-based: jobs store `finish_at`, no server loops.
- **Abundance** (mines, quarries): 70-95% at construction, scales output. Planned: slow decay (about 1% per month) and exploration.

## Progression
- Company level rises from constructing buildings (+50 XP) and using them (+10 XP per run). Level = 1 + XP / 100.
- Higher levels unlock more building types.

## Buildings (stage 2)
Water Reservoir, Power Plant, Plantation (L1) -> Mine, Quarry (L2) -> Brick Factory (L3).

## Planned
Construction materials for new buildings and upgrades, transport units, contracts, retail stores, executives, research, banking, administration overhead, encyclopedia, rankings, real map regions.

## Guest flow
New players enter as guests (Supabase anonymous sign-in). After the first building, a "Save your progress" dialog turns the guest into a real account.
