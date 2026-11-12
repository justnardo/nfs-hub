# NFS Hub — Gateline (first module)

Passenger services (above-the-wing) sister product to Rampline, for Nassau Flight Services.
A First Glance Bahamas product. All staff names in the demo are generated and fictional.

## Run it

```bash
pnpm install
pnpm --filter @nfs/gateline dev      # http://localhost:3100
# production
pnpm --filter @nfs/gateline build && pnpm --filter @nfs/gateline start
```

Sign in at `/login` with a staff ID and password; the account decides the role and landing page. Demo password for every account: `Gateline2026`. Demo IDs: Super Admin NFS-4170, Manager NFS-4168, Supervisor NFS-4164, Lead (United) NFS-4100, Lead (Western Air) NFS-4150, Agent (Air Canada) NFS-4118.

## What's in the box

| Area | Route | Notes |
|---|---|---|
| Today board | `/` | Departures with gate progress, today's SLA coverage, live gate activity, discrepancies, training expiring |
| SLA coverage heatmap | `/coverage` | Airline × day × shift, trained agents vs SLA peak demand. Tap a gap → protected reassignment (float pool first; core agents warn; untrained/expired blocked; manager override with reason) |
| Rosters | `/rosters` | Airline-specific weekly rosters, E→L→Off rotation, union rule checks (11h rest, ≤3 lates, 2 consecutive days off in Sun–Sat, 40h), CSV export |
| Airlines | `/airlines`, `/airlines/[code]` | SLA minimums, required training, core team, backup pool, station manager, schedule, feedback |
| Agents | `/agents`, `/agents/[id]` | Role, terminal, airlines trained (TakeFlight), portfolio: flights, positions, teammates, on-time, delays split by cause |
| Gate log (phone) | `/gate`, `/gate/[flightId]` | Team assignment against SLA, one-tap timestamps (door open → pushback), edit/undo, pax boarded, discrepancies with photo, delay cause, file. Works offline and syncs on reconnect |
| Flight tracking | `/flights` | US + International terminals, status from gate logs; FR24 / FlightAware adapters ready for trial keys |
| Flight records | `/records`, `/records/[id]` | Filter by date/airline/lead, CSV export, printable/shareable record |
| Analytics | `/analytics` | D0/D15, SLA compliance, boarding time, delay causes (NFS vs outside), airline scorecard, lead table, board report print |
| Airline feedback | `/feedback` | Station-manager praise/complaints tied to flight records |
| My schedule | `/me` | Agent's own roster, training, portfolio |

## Monorepo

```
apps/gateline        Next.js 15 PWA (Tailwind v4 + shadcn-style components)
packages/ui          Design tokens + components shared by every module
packages/auth        Roles, permissions, session (demo) — Supabase Auth drop-in
packages/db          Domain types, Nassau time helpers, SLA demand maths, deterministic demo seed
packages/rules       Union / rest / fatigue engine, training eligibility, coverage + protected reassignment
packages/events      Hub event log: publish/subscribe, offline outbox (Supabase Realtime when configured)
packages/flights     Flight status + FR24 / FlightAware / FiNDnet connector interface
supabase/migrations  core schema + gateline schema with RLS (tested on Postgres 16)
supabase/seed.sql    Same fictional data as the demo (pnpm seed:sql)
```

## Demo mode vs production

- **Demo mode (now):** data is generated in the browser from a fixed seed, so every device shows the same staff and history. Gate logs, covers and feedback status persist in the browser and sync live **between tabs** of the same browser (each tab has its own sign-in, so a phone-sized lead tab and the manager dashboard can run side by side). Toggle Online/Offline in the top bar to show offline capture.
- **Production:** create a Supabase project, apply `supabase/migrations`, load `supabase/seed.sql` (or real NFS data), and set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The event bus already writes to `core.events` and listens over Realtime when those are set; the data store (`apps/gateline/src/lib/store.tsx`) is the one file to switch from the seed to Supabase reads/writes for cross-device sync.

## Placeholders waiting on NFS

SLA minimums per airline, the full above-the-wing airline list, current passenger services rosters, the manual gate form, passenger-services union rules, training records by airline, and the NFS logo files.
