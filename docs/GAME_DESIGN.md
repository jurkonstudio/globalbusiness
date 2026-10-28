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

## Tutorial (stage 3)
Players enter automatically as guests with $5,000 and Level 0:
1. Name the company. 2. Buy Seeds and Water from the NPC (Warehouse).
3. Plant apples on a Map land slot (builds an Apple Orchard for $1,000, uses 1 Seeds + 2 Water).
4. Wait 3 minutes, collect the harvest: tutorial done, Level 1.
A "Save your progress" dialog appears right after planting. Land is per company (24 slots); a shared world map comes later.

## Early game (session 2, quest-log style)
Start: $5,000, Level 0, guest account. The tutorial (name, seeds + water, plant apples, harvest) ends at Level 1.
Then a **Missions** list (target icon on the map) pays cash and XP for the next goals: name the company, build
Water Reservoir / Power Plant / Plantation, collect water, build in another region, own 5 buildings, reach Level 3.
Missions are verified and paid by the server (`mission_status`, `claim_mission`).

## World and regions
Home Isle (L0, 24 plots, no freight), Verdant Coast (L2, farms +15%), Iron Ridge (L3, mines +15%),
Port Meridian (L4, factories +15%), Sunspire Atoll (L5, utilities +15%). Remote regions add a land fee
($500 per distance step) and a freight cost when harvesting (2% x distance x quantity x transport). Each company
present in a region shows as a small hut on its shore (`region_activity`).

## Timers and offline progress
All progress is a timestamp in Postgres, never a browser timer.
- Construction: `buildings.build_finish_at` (time from `building_types.build_seconds`).
- Upgrades: `upgrade_finish_at`, cost = 60% of build cost x level, time = build time x level, max level 6.
- Production / crops: `production_jobs.finish_at`.
The map shows timers **only** for buildings under construction, upgrades, and the apple orchard crop.
Closing the game changes nothing: on return the server settles finished upgrades and `welcome_back()` reports
what completed while the player was away. Harvests wait in the building until collected.
