import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import Header from '@/app/components/Header'
import { isConfigured, listSites } from '@/lib/db'
import { fmtDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

const PLATFORM_LABEL: Record<string, string> = {
  'wp-single': 'WordPress',
  'wp-multisite': 'WP Multisite',
  'drupal': 'Drupal',
}

export default async function HomePage() {
  const configured = isConfigured()
  const sites = configured ? await listSites() : []
  const active = sites.filter(s => s.active && !s.paused_at)
  const paused = sites.filter(s => s.active && s.paused_at)
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
        <Section title="Active" sites={active} />
        {paused.length > 0 && <Section title="Paused" sites={paused} dim />}
        {inactive.length > 0 && <Section title="Inactive" sites={inactive} dim />}
        {configured && sites.length === 0 && (
          <p className="text-sm text-slate-400">No sites in the registry.</p>
        )}
      </div>
    </main>
  )
}

function Section({
  title, sites, dim,
}: {
  title: string
  sites: Awaited<ReturnType<typeof listSites>>
  dim?: boolean
}) {
  if (sites.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title} · {sites.length}
      </h2>
      <div className="divide-y divide-slate-700/50 overflow-hidden rounded-lg border border-pantheon-border bg-pantheon-bg-card">
        {sites.map(s => (
          <Link
            key={s.site}
            href={`/sites/${encodeURIComponent(s.site)}`}
            className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-800 ${dim ? 'opacity-60' : ''}`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-white">
                {s.machine_name || s.site_name || s.site}
              </div>
              {s.site_name && s.site_name !== s.machine_name && (
                <div className="truncate text-sm text-slate-400">{s.site_name}</div>
              )}
            </div>
            <span className="rounded bg-slate-700/60 px-2 py-0.5 text-xs text-slate-300">
              {PLATFORM_LABEL[s.platform] ?? s.platform}
            </span>
            <span className="hidden text-xs text-slate-500 sm:inline">
              last deploy {fmtDate(s.last_deployment)}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
          </Link>
        ))}
      </div>
    </section>
  )
}
