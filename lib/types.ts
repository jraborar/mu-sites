// Shapes of the SHARED Supabase tables mu-sites reads. These mirror the source-of-
// truth definitions in the sibling apps — keep them in sync:
//   - Site / StagingSchedule ........ mu-wp-staging  (lib/sites.ts, lib/scheduleStore.ts)
//   - StagingRecord ................. mu-wp-staging  (lib/supabase.ts, table staging_history)
//   - DeploymentRecord ............. mu-deployment  (lib/supabase.ts, table deployment_history)
//   - ScheduledDeployment .......... mu-deployment  (table scheduled_deployments)
//
// JOIN-KEY GOTCHA: staging_history.site is the Pantheon UUID, deployment_history.site
// is the Pantheon machine-name. Both bridge through the `sites` registry
// (sites.site = UUID, sites.machine_name = name). See lib/db.ts.

export type Cadence =
  | 'weekly' | 'biweekly' | 'monthly' | 'bimonthly-week-of-15' | 'security-only' | 'once'

export interface StagingSchedule {
  id: string
  site: string                  // Pantheon UUID
  site_name?: string
  cadence: Cadence
  day_of_week?: number          // 0=Sun … 6=Sat
  week_of_month?: number        // 1–4, -1=last; monthly only
  biweekly_reference_date?: string
  bimonthly_ref_month?: number
  bimonthly_day_of_week?: number
  security_check_enabled: boolean
  security_check_pending: boolean
  deploy_days?: number
  deploy_destination?: string
  skip_upstream: boolean
  skip_plugins_themes: boolean
  active: boolean
  created_at: string
  last_staged_at?: string
  next_staging_at?: string
  override_at?: string | null
  skip_week?: string | null
}

export type Platform = 'wp-single' | 'wp-multisite' | 'drupal'

export interface Site {
  site: string                  // primary key — Pantheon UUID
  machine_name?: string | null  // Pantheon machine name — what UIs display
  site_name?: string | null
  platform: Platform
  upstream?: string | null
  deploy_days: number
  deploy_destination: string    // dev|test|live|multidev
  deploy_approval: string       // manual|auto
  vrt_enabled: boolean
  active: boolean
  last_deployment?: string | null  // cadence anchor (sql/009)
  paused_at?: string | null
  paused_until?: string | null
  pause_reason?: string | null
}

export interface UpdatedItem { name: string; title?: string; from?: string; to?: string }

export interface StagingRecord {
  id: string
  site: string                  // Pantheon UUID
  site_name?: string | null
  multidev: string
  platform?: string | null
  upstream_updated?: boolean
  upstream_old_version?: string | null
  upstream_new_version?: string | null
  plugins_updated?: UpdatedItem[] | null
  themes_updated?: UpdatedItem[] | null
  composer_deps_updated?: UpdatedItem[] | null
  vrt_report_url?: string | null
  vrt_flagged_count?: number | null
  vrt_status?: string | null
  status: string                // running|completed|failed|cancelled|paused
  started_at: string
  completed_at?: string | null
}

export interface DeploymentRecord {
  id: string
  site: string                  // Pantheon machine-name
  site_name?: string | null
  source: string                // source env or multidev name (link back to staging)
  destination: string           // dev|test|live
  stages_completed?: string[] | null
  status: string                // running|completed|failed|cancelled|paused
  started_at: string
  completed_at?: string | null
}

export interface ScheduledDeployment {
  id: string
  site: string
  site_name?: string | null
  source: string
  destination: string
  scheduled_for: string
  status: string                // pending|triggered|cancelled
  consultant?: string | null
  notes?: string | null
}
