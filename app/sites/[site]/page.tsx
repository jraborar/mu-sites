import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import Header from '@/app/components/Header'
import {
  getSite, getSchedulesForSite, getStagingForSite,
  getDeploymentsForSite, getScheduledDeploymentsForSite,
} from '@/lib/db'
import { buildCards, type Card, type CardStatus } from '@/lib/cards'
import type { StagingRecord } from '@/lib/types'
import { fmtDate, fmtDateTime } from '@/lib/format'

export const dynamic = 'force-dynamic'

const STATUS: Record<CardStatus, { label: string; cls: string }> = {
  'on-time':       { label: 'On time',              cls: 'text-pantheon-success border-pantheon-success/40 bg-pantheon-success/10' },
  'deployed-late': { label: 'Deployed late',        cls: 'text-pantheon-warning border-pantheon-warning/40 bg-pantheon-warning/10' },
  'in-progress':   { label: 'In progress',          cls: 'text-pantheon-info border-pantheon-info/40 bg-pantheon-info/10' },
  'staged':        { label: 'Staged, not deployed', cls: 'text-pantheon-warning border-pantheon-warning/40 bg-pantheon-warning/10' },
  'due':           { label: 'Due now',              cls: 'text-pantheon-info border-pantheon-info/40 bg-pantheon-info/10' },
  'missed':        { label: 'Missed',               cls: 'text-pantheon-error border-pantheon-error/40 bg-pantheon-error/10' },
  'upcoming':      { label: 'Upcoming',             cls: 'text-slate-400 border-slate-600/50 bg-slate-700/20' },
}

function updateSummary(s: StagingRecord): string {
  const parts: string[] = []
  if (s.upstream_updated) parts.push(`upstream ${s.upstream_old_version ?? '?'} → ${s.upstream_new_version ?? '?'}`)
  const p = s.plugins_updated?.length ?? 0
  const th = s.themes_updated?.length ?? 0
  const c = s.composer_deps_updated?.length ?? 0
  if (p) parts.push(`${p} plugin${p > 1 ? 's' : ''}`)
  if (th) parts.push(`${th} theme${th > 1 ? 's' : ''}`)
  if (c) parts.push(`${c} dep${c > 1 ? 's' : ''}`)
  return parts.length ? parts.join(' · ') : 'no changes'
}

export default async function SitePage({ params }: { params: Promise<{ site: string }> }) {
  const { site: siteParam } = await params
  const uuid = decodeURIComponent(siteParam)
  const site = await getSite(uuid)

  if (!site) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Header current="sites" />
        <p className="mt-8 text-sm text-slate-400">
          No site found for <code className="font-mono">{uuid}</code>.{' '}
          <Link href="/" className="text-pantheon-yellow hover:underline">Back to all sites</Link>
        </p>
      </main>
    )
  }

  const keys = [site.site, site.machine_name].filter(Boolean) as string[]
  const [schedules, staging, deployments, scheduled] = await Promise.all([
    getSchedulesForSite(site.site),
    getStagingForSite(site.site),
    getDeploymentsForSite(keys),
    getScheduledDeploymentsForSite(keys),
  ])

  const { cards, omittedRuns } = buildCards(site, schedules, staging, deployments, scheduled)
  const sched = schedules.find(s => s.active && s.cadence !== 'security-only')

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Header current="sites" />

      <Link href="/" className="mt-6 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> All sites
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl font-bold text-white">{site.machine_name || site.site_name || site.site}</h2>
        {site.site_name && site.site_name !== site.machine_name && (
          <span className="text-slate-400">{site.site_name}</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
        <span className="rounded bg-slate-700/60 px-2 py-0.5">{site.platform}</span>
        <span className="rounded bg-slate-700/60 px-2 py-0.5">
          cadence: {sched ? sched.cadence : 'none'}
        </span>
        <span className="rounded bg-slate-700/60 px-2 py-0.5">→ {site.deploy_destination} · {site.deploy_approval}</span>
        {site.paused_at && (
          <span className="rounded bg-pantheon-warning/15 px-2 py-0.5 text-pantheon-warning">
            paused{site.paused_until ? ` until ${fmtDate(site.paused_until)}` : ''}
          </span>
        )}
        <span className="rounded bg-slate-700/60 px-2 py-0.5">anchor: {fmtDate(site.last_deployment)}</span>
      </div>

      <div className="mt-6 space-y-3">
        {cards.length === 0 && (
          <p className="text-sm text-slate-400">
            No schedule and no run history for this site yet.
          </p>
        )}
        {cards.map(card => <CardRow key={card.key} card={card} />)}

        {omittedRuns > 0 && (
          <p className="pt-1 text-center text-xs text-slate-500">
            + {omittedRuns} older run{omittedRuns > 1 ? 's' : ''} not shown
          </p>
        )}
      </div>
    </main>
  )
}

function CardRow({ card }: { card: Card }) {
  const s = STATUS[card.status]
  const deploy = card.deploy
  const staging = card.staging
  const vrt = card.vrt

  return (
    <div className="animate-fade-in rounded-lg border border-pantheon-border bg-pantheon-bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
        <span className="font-medium text-white">
          {card.adHoc ? 'Ad-hoc run' : `${card.monthLabel} · Week ${card.weekOfMonth} of ${card.weeksInMonth}`}
        </span>
        <span className="text-sm text-slate-400">{card.weekRange}</span>
        {card.runsInWeek > 1 && (
          <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-xs text-slate-400">
            +{card.runsInWeek - 1} run{card.runsInWeek - 1 > 1 ? 's' : ''}
          </span>
        )}
        {!card.adHoc && (
          <span className="ml-auto text-xs text-slate-500">target {fmtDateTime(card.target)}</span>
        )}
      </div>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <Field label="Staging">
          {staging ? (
            <>
              <div className="text-slate-200">{updateSummary(staging)}</div>
              <div className="text-xs text-slate-500">
                {staging.multidev} · {fmtDateTime(staging.started_at)}
                {staging.status !== 'completed' && ` · ${staging.status}`}
              </div>
            </>
          ) : <span className="text-slate-500">not staged</span>}
        </Field>

        <Field label="Deploy">
          {deploy ? (
            <>
              <div className="text-slate-200">→ {deploy.destination} · {deploy.status}</div>
              <div className="text-xs text-slate-500">{fmtDateTime(deploy.completed_at ?? deploy.started_at)}</div>
            </>
          ) : card.booked ? (
            <>
              <div className="text-pantheon-info">booked → {card.booked.destination}</div>
              <div className="text-xs text-slate-500">{fmtDateTime(card.booked.scheduled_for)}</div>
            </>
          ) : <span className="text-slate-500">—</span>}
        </Field>

        <Field label="VRT">
          {vrt && (vrt.url || vrt.status) ? (
            vrt.url ? (
              <a
                href={vrt.url}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-1 hover:underline ${
                  (vrt.flagged ?? 0) > 0 ? 'text-pantheon-warning' : 'text-pantheon-success'
                }`}
              >
                {(vrt.flagged ?? 0) > 0 ? `${vrt.flagged} flagged` : 'clean'}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : <span className="text-slate-300">{vrt.status}</span>
          ) : <span className="text-slate-500">—</span>}
        </Field>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}
