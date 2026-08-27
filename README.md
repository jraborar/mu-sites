# mu-sites

A **per-site staging & deployment timeline** for the MU managed-update pipeline. It
shows, for each site, a stack of **cards** — one per on-cadence maintenance window —
and whether that window was **staged and deployed on time, late, or missed**.

```
apexorderpickup
  [On time]  August 2026 · Week 4 of 4   Aug 24–28
  [Missed]   September 2026 · Week 1 of 5  Aug 31 – Sep 4
```

## What it is (and isn't)

- **Read-only.** mu-sites never writes to any table. It's a *projection* over data the
  three source apps already own:
  - `staging_history` + `staging_schedules` + `sites` ← **mu-wp-staging**
  - `deployment_history` + `scheduled_deployments` ← **mu-deployment**
  - VRT status is read off `staging_history` (owned by **mu-vrt**)
- **Local-first.** No Railway service yet — runs on `localhost:3005`. It reads the
  **shared Supabase** directly with the service-role key, so it works even when the
  other apps are down and touches neither source repo.
- **Cards are derived, not stored.** No new tables, no migrations. A card's outcome is
  computed at read time from the window bounds vs. the run/deploy timestamps.

## The card model

A **card = one on-cadence ISO week (Mon–Sun, Manila)**. The window math is a pristine
copy of mu-wp-staging's `lib/cadence.ts` (`currentWindowTarget` / `computeNextOccurrence`)
so windows line up exactly with the scheduler. Outcomes:

| Status | Meaning |
|---|---|
| `on-time` | staged **and** deployed to live within the window |
| `deployed-late` | deployed, but after the window closed |
| `in-progress` | staged this week, deploy not done, window still open |
| `staged` | window closed, staged but never deployed |
| `due` | current window, target passed, nothing staged yet |
| `missed` | window closed with no staging run |
| `upcoming` | window hasn't been reached yet |

"Missed → next card" is not a new mechanic — it's the cadence's own **NO-MAKE-UP**
rule: a week that passes without a run is lost, parity never slides forward, and the
next on-cadence week picks everything up (updates are cumulative).

### Join-key gotcha
`staging_history.site` is the Pantheon **UUID**; `deployment_history.site` is the
**machine-name**. Both bridge through the `sites` registry. mu-sites queries the deploy
tables on *both* ids to stay correct — see [lib/db.ts](lib/db.ts) and [lib/types.ts](lib/types.ts).

## Run it

```bash
cp .env.example .env.local     # fill from the shared Supabase project
npm install
npm run dev                    # http://localhost:3005
```

Required env (read-only reads):
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Status: Milestone 1

Read-only, all sites listed, per-site card timeline. Next up: auth + a shared top bar,
richer per-card report detail (plugin/theme diffs, VRT before/after), and a decision on
whether it ever earns its own Railway service.
