import type {
  Site, StagingSchedule, StagingRecord, DeploymentRecord, ScheduledDeployment,
} from '@/lib/types'
import {
  currentWindowTarget, computeNextOccurrence, isoWeekMonday, getManilaMonthDay,
} from '@/lib/cadence'
import { fmtWeekRange, monthLabel } from '@/lib/format'

// A card = one on-cadence ISO week (Mon–Sun) for a site. Cards are DERIVED at read
// time — nothing is stored. The outcome is computed by comparing the staging run and
// live deploy for that week against the window bounds. The "missed → next card"
// behaviour isn't invented here: it's the cadence's own NO-MAKE-UP rule (a week that
// passes without a run is lost; parity never slides forward — see lib/cadence.ts).

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const LOOKBACK_WEEKS = 26          // how far back to probe for on-cadence (post-anchor) windows
const LOOKAHEAD_OCCURRENCES = 6    // future on-cadence windows to project
const ADHOC_LOOKBACK_WEEKS = 12    // how far back to surface off-cadence / historical runs

export type CardStatus =
  | 'on-time'        // staged AND deployed to live within the window
  | 'deployed-late'  // deployed to live, but after the window closed
  | 'in-progress'    // staged this week, deploy not yet done, window still open
  | 'staged'         // window closed, staged but never deployed to live
  | 'due'            // current window, target passed, nothing staged yet
  | 'missed'         // window closed with no staging run
  | 'upcoming'       // window hasn't been reached yet

// A card's "kind": on-cadence maintenance, a generic off-cadence run, or an off-cadence
// run that applied a core/upstream update (the security fast-track lane in mu-wp-staging,
// which fires off-week only). `staging_history` has NO flag for this — it's inferred from
// off-cadence placement + upstream_updated. See docs/mu-sites-unscheduled-upstream-card-pr.md.
export type CardKind = 'cadence' | 'adhoc' | 'unscheduled-upstream'

export interface Card {
  key: string
  cadence: string
  kind: CardKind
  adHoc: boolean               // a run outside any on-cadence window (manual / fast-track)
  upstreamOnly: boolean        // run applied core/upstream with NO plugin/theme/dep changes
  monthLabel: string           // "August 2026"
  weekOfMonth: number          // 1-based within the month (0 for ad-hoc)
  weeksInMonth: number         // 0 for ad-hoc
  weekRange: string            // "Aug 24–28"
  target: string               // scheduled staging moment (ISO)
  windowStart: string          // Monday 00:00 PHT (ISO)
  windowEnd: string            // following Monday 00:00 PHT (ISO, exclusive)
  status: CardStatus
  onTime: boolean
  runsInWeek: number           // total staging runs that fell in this window (≥1 when staged)
  staging: StagingRecord | null
  deploy: DeploymentRecord | null
  vrt: { status?: string | null; flagged?: number | null; url?: string | null } | null
  booked: ScheduledDeployment | null
}

export interface CardTimeline {
  cards: Card[]
  omittedRuns: number          // older ad-hoc runs not shown (beyond ADHOC_LOOKBACK_WEEKS)
}

const t = (iso: string) => new Date(iso).getTime()
const inWindow = (iso: string | null | undefined, start: number, end: number) =>
  !!iso && t(iso) >= start && t(iso) < end

// A run that applied core/upstream and nothing else — the strong "pure Core Security
// Update" signal (the fast-track lane sets skipPluginsThemes:true upstream of us).
const isUpstreamOnly = (r: StagingRecord | null): boolean =>
  !!r?.upstream_updated &&
  !(r.plugins_updated?.length) &&
  !(r.themes_updated?.length) &&
  !(r.composer_deps_updated?.length)

function primarySchedule(schedules: StagingSchedule[]): StagingSchedule | null {
  return schedules.find(s => s.active && s.cadence !== 'security-only') ?? null
}

// All on-cadence window targets across the visible range (past → future), deduped.
function windowTargets(sched: StagingSchedule, anchor: string | null | undefined, now: Date): Date[] {
  const byIso = new Map<string, Date>()

  // Past + current: probe each of the last N ISO weeks (Manila has no DST, so
  // subtracting exact weeks lands in the right ISO week).
  for (let k = LOOKBACK_WEEKS; k >= 0; k--) {
    const probe = new Date(now.getTime() - k * WEEK_MS)
    const target = currentWindowTarget(sched, anchor, probe)
    if (target) byIso.set(target.toISOString(), target)
  }

  // Future occurrences.
  let cursor = now
  for (let i = 0; i < LOOKAHEAD_OCCURRENCES; i++) {
    const next = computeNextOccurrence(sched, cursor, anchor)
    if (!next) break
    byIso.set(next.toISOString(), next)
    cursor = next
  }

  return [...byIso.values()].sort((a, b) => a.getTime() - b.getTime())
}

// The best live deploy for a staging run: linked by multidev name (source), preferring
// the site's deploy destination and a completed status, most recent first.
function deployForRun(
  run: StagingRecord | null,
  deployments: DeploymentRecord[],
  dest: string,
  start: number,
  end: number,
): DeploymentRecord | null {
  const candidates = run
    ? deployments.filter(d => d.source === run.multidev)
    : deployments.filter(d => inWindow(d.completed_at ?? d.started_at, start, end))
  if (!candidates.length) return null
  const score = (d: DeploymentRecord) =>
    (d.destination === dest ? 4 : 0) +
    (d.status === 'completed' ? 2 : 0) +
    (t(d.completed_at ?? d.started_at) / 1e15) // recency tiebreak
  return candidates.slice().sort((a, b) => score(b) - score(a))[0] ?? null
}

function classify(
  staging: StagingRecord | null,
  deploy: DeploymentRecord | null,
  deployInWindow: boolean,
  reached: boolean,
  closed: boolean,
): CardStatus {
  if (deploy && deploy.status === 'completed') return deployInWindow ? 'on-time' : 'deployed-late'
  if (staging && staging.status === 'completed') return closed ? 'staged' : 'in-progress'
  if (!reached) return 'upcoming'
  return closed ? 'missed' : 'due'
}

export function buildCards(
  site: Site,
  schedules: StagingSchedule[],
  staging: StagingRecord[],
  deployments: DeploymentRecord[],
  scheduled: ScheduledDeployment[],
  now: Date = new Date(),
): CardTimeline {
  const sched = primarySchedule(schedules)
  const dest = site.deploy_destination || 'live'
  const used = new Set<string>()
  const cards: Card[] = []

  if (sched) {
    for (const target of windowTargets(sched, site.last_deployment, now)) {
      const mon = isoWeekMonday(target)
      const windowStart = mon.getTime()
      const windowEnd = windowStart + WEEK_MS
      const fri = new Date(windowStart + 4 * DAY_MS)

      const reached = now.getTime() >= target.getTime()
      const closed = now.getTime() >= windowEnd

      const runsThisWeek = staging
        .filter(s => inWindow(s.started_at, windowStart, windowEnd))
        .sort((a, b) => {
          const c = Number(b.status === 'completed') - Number(a.status === 'completed')
          return c !== 0 ? c : t(b.started_at) - t(a.started_at)
        })
      const run = runsThisWeek[0] ?? null
      if (run) runsThisWeek.forEach(r => used.add(r.id))

      const deploy = deployForRun(run, deployments, dest, windowStart, windowEnd)
      const deployInWindow = !!deploy && inWindow(deploy.completed_at ?? deploy.started_at, windowStart, windowEnd)

      const booked = scheduled.find(s =>
        (run && s.source === run.multidev) || inWindow(s.scheduled_for, windowStart, windowEnd),
      ) ?? null

      cards.push({
        key: target.toISOString(),
        cadence: sched.cadence,
        kind: 'cadence',
        adHoc: false,
        upstreamOnly: isUpstreamOnly(run),
        monthLabel: monthLabel(target),
        weekOfMonth: 0,
        weeksInMonth: 0,
        weekRange: fmtWeekRange(mon, fri),
        target: target.toISOString(),
        windowStart: mon.toISOString(),
        windowEnd: new Date(windowEnd).toISOString(),
        status: classify(run, deploy, deployInWindow, reached, closed),
        onTime: !!deploy && deploy.status === 'completed' && deployInWindow,
        runsInWeek: runsThisWeek.length,
        staging: run,
        deploy,
        vrt: run ? { status: run.vrt_status, flagged: run.vrt_flagged_count, url: run.vrt_report_url } : null,
        booked,
      })
    }

    // Number each card "Week N of M" within its calendar month (by the target's month).
    const groups = new Map<string, Card[]>()
    for (const c of cards) {
      const { year, month } = getManilaMonthDay(new Date(c.target))
      const gk = `${year}-${month}`
      if (!groups.has(gk)) groups.set(gk, [])
      groups.get(gk)!.push(c)
    }
    for (const group of groups.values()) {
      group.sort((a, b) => t(a.target) - t(b.target))
      group.forEach((c, i) => { c.weekOfMonth = i + 1; c.weeksInMonth = group.length })
    }
  }

  // Ad-hoc: staging runs not claimed by an on-cadence window (manual, security
  // fast-track, or pre-anchor history — cadence parity is only defined AFTER
  // last_deployment, so older runs never map to a synthesized window). Grouped to one
  // card per ISO week and bounded to recent history so months of runs don't bury the
  // schedule; anything older is counted as omittedRuns rather than rendered.
  const adhocCutoff = now.getTime() - ADHOC_LOOKBACK_WEEKS * WEEK_MS
  const byWeek = new Map<string, StagingRecord[]>()
  let omittedRuns = 0
  for (const run of staging) {
    if (used.has(run.id)) continue
    if (t(run.started_at) < adhocCutoff) { omittedRuns++; continue }
    const wk = isoWeekMonday(new Date(run.started_at)).toISOString()
    if (!byWeek.has(wk)) byWeek.set(wk, [])
    byWeek.get(wk)!.push(run)
  }

  for (const [wk, runs] of byWeek) {
    runs.sort((a, b) => {
      const c = Number(b.status === 'completed') - Number(a.status === 'completed')
      return c !== 0 ? c : t(b.started_at) - t(a.started_at)
    })
    const run = runs[0]
    const mon = new Date(wk)
    const windowStart = mon.getTime()
    const windowEnd = windowStart + WEEK_MS
    const fri = new Date(windowStart + 4 * DAY_MS)
    const deploy = deployForRun(run, deployments, dest, windowStart, windowEnd)
    const deployInWindow = !!deploy && inWindow(deploy.completed_at ?? deploy.started_at, windowStart, windowEnd)

    // Off-cadence run that applied a core/upstream update = an unscheduled Core Security
    // Update; otherwise a generic manual (plugins/themes) ad-hoc run.
    const kind: CardKind = run.upstream_updated ? 'unscheduled-upstream' : 'adhoc'

    cards.push({
      key: `adhoc-${wk}`,
      cadence: kind === 'unscheduled-upstream' ? 'unscheduled-upstream' : 'ad-hoc',
      kind,
      adHoc: true,
      upstreamOnly: isUpstreamOnly(run),
      monthLabel: monthLabel(mon),
      weekOfMonth: 0,
      weeksInMonth: 0,
      weekRange: fmtWeekRange(mon, fri),
      target: run.started_at,
      windowStart: mon.toISOString(),
      windowEnd: new Date(windowEnd).toISOString(),
      status: classify(run, deploy, deployInWindow, true, true),
      onTime: !!deploy && deploy.status === 'completed' && deployInWindow,
      runsInWeek: runs.length,
      staging: run,
      deploy,
      vrt: { status: run.vrt_status, flagged: run.vrt_flagged_count, url: run.vrt_report_url },
      booked: null,
    })
  }

  // Newest first.
  cards.sort((a, b) => t(b.target) - t(a.target))
  return { cards, omittedRuns }
}
