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

Sign in at `/login` with a staff ID and password; the account decides the role and landing page. Demo password for every account: `Gateline2026`. Demo IDs: Super Admin NFS-1000, Manager NFS-1001, Supervisor NFS-1011, Lead (United) NFS-4100, Lead (InterCaribbean) NFS-4144, Agent (Air Canada) NFS-4119.

## What's in the box

| Area | Route | Notes |
|---|---|---|
| Today board | `/` | Departures with gate progress, today's SLA coverage, live gate activity, discrepancies, training expiring |
| SLA coverage heatmap | `/coverage` | Airline × day × shift, trained agents vs SLA peak demand. Tap a gap → protected reassignment (float pool first; core agents warn; untrained/expired blocked; manager override with reason) |
| Rosters | `/rosters` | Engine-built airline rosters. Managers edit any cell (rules re-check live), optimise the week (manager changes and the past stay fixed), fix gaps from ranked suggestions, move staff between teams, see 15-minute coverage and the staffing outlook |
| Airlines | `/airlines`, `/airlines/[code]` | Managers add/edit airlines (SLA minimums per flight, terminal, logo, training, station manager) and their flight schedules |
| My profile | `/profile` | Staff upload a photo (shown everywhere), change email/mobile, request a password change; role, team and training are locked |
| Rule settings | `/settings` | Managers set thresholds, severity and on/off per rule (union law items stay on) |
| Accounts | `/admin` | Super Admin handles password requests |
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
packages/rules       Roster engine: rule modules + settings, 15-min coverage, week optimiser, ranked gap fixes, staffing outlook
packages/demo        Deterministic fictional demo data, built by the engine
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

## Roster periods, sharing and the change log

- **Create roster** (supervisors and managers): the engine builds a 1–4 week draft for one team or all teams against flight demand, SLA minimums and the rules. Weeks run Sunday–Saturday.
- **Publish** (managers): the draft becomes the live roster. Day-to-day changes after that are logged and marked on the roster and the share link.
- **PDF**: branded, landscape, one table per team per week with coverage vs SLA. Drafts are marked DRAFT.
- **Share link** (`/r/<token>`): read-only, no sign-in. Agents find their name, see their shifts and add them to their phone calendar (.ics). It expires at the end of the roster and can be revoked.
- **Change log** (`/changes`, managers): every shift change, agent move, team assignment, publish and config change, with who, role, when and reason. Undo from the log.
