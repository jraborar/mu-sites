import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import Header from '@/app/components/Header'
import { isConfigured, listSites, getActiveProcesses, type ActiveProcess } from '@/lib/db'
import { fmtDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

const PLATFORM_LABEL: Record<string, string> = {
  'wp-single': 'WordPress',
  'wp-multisite': 'WP Multisite',
  'drupal': 'Drupal',
}

export default async function HomePage() {
  const configured = isConfigured()
  const [sites, activeProcesses] = configured
    ? await Promise.all([listSites(), getActiveProcesses()])
    : [[], new Map<string, ActiveProcess>()]

  const active   = sites.filter(s => s.active && !s.paused_at)
  const paused   = sites.filter(s => s.active &&  s.paused_at)
  const inactive = sites.filter(s => !s.active)

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Header current="sites" />

      {!configured && (
        <div className="mt-8 rounded-lg border border-pantheon-warning/40 bg-pantheon-warning/10 p-4 text-sm text-pantheon-warning">
          Supabase isn&apos;t configured. Copy <code className="font-mono">.env.example</code> to{' '}
          <code className="font-mono">.env.local</code> and set{' '}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> +{' '}
          <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> from the shared project.
        </div>
      )}

      <div className="mt-8 space-y-6">
        <Section title="Active" sites={active} activeProcesses={activeProcesses} />
        {paused.length > 0 && <Section title="Paused" sites={paused} activeProcesses={activeProcesses} dim />}
        {inactive.length > 0 && <Section title="Inactive" sites={inactive} activeProcesses={activeProcesses} dim />}
        {configured && sites.length === 0 && (
          <p className="text-sm text-pantheon-text-muted">No sites in the registry.</p>
        )}
      </div>
    </main>
  )
}

function Section({
  title, sites, activeProcesses, dim,
}: {
  title: string
  sites: Awaited<ReturnType<typeof listSites>>
  activeProcesses: Map<string, ActiveProcess>
  dim?: boolean
}) {
  if (sites.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-pantheon-text-dim">
        {title} · {sites.length}
      </h2>
      <div className="divide-y divide-pantheon-border/50 overflow-hidden rounded-lg border border-pantheon-border bg-pantheon-bg-card">
        {sites.map(s => {
          // Check both site UUID and machine_name since different tables use different keys
          const proc = activeProcesses.get(s.site) ?? activeProcesses.get(s.machine_name ?? '')
          const isLive = !!proc

          return (
            <Link
              key={s.site}
              href={`/sites/${encodeURIComponent(s.site)}`}
              className={[
                'flex items-center gap-3 px-4 py-3 transition-colors',
                isLive
                  ? 'border-l-2 border-l-pantheon-yellow bg-pantheon-yellow/5 hover:bg-pantheon-yellow/10'
                  : 'hover:bg-pantheon-bg-elevated/40',
                dim && !isLive ? 'opacity-60' : '',
              ].join(' ')}
            >
              {/* Live pulse dot */}
              {isLive && (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pantheon-yellow opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-pantheon-yellow" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-pantheon-text">
                  {s.machine_name || s.site_name || s.site}
                </div>
                {isLive ? (
                  <div className="text-xs text-pantheon-yellow">
                    {proc!.kind === 'deploy'
                      ? `Deploying → ${proc!.ref}${proc!.status === 'paused' ? ' (paused)' : '…'}`
                      : `Staging ${proc!.ref}${proc!.status === 'paused' ? ' (paused)' : '…'}`}
                  </div>
                ) : s.site_name && s.site_name !== s.machine_name ? (
                  <div className="truncate text-sm text-pantheon-text-muted">{s.site_name}</div>
                ) : null}
              </div>

              <span className="rounded bg-pantheon-bg-elevated/60 px-2 py-0.5 text-xs text-pantheon-text">
                {PLATFORM_LABEL[s.platform] ?? s.platform}
              </span>
              {!isLive && (
                <span className="hidden text-xs text-pantheon-text-dim sm:inline">
                  last deploy {fmtDate(s.last_deployment)}
                </span>
              )}
              <ChevronRight className={`h-4 w-4 shrink-0 ${isLive ? 'text-pantheon-yellow' : 'text-pantheon-text-dim'}`} />
            </Link>
          )
        })}
      </div>
    </section>
  )
}
