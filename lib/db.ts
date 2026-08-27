import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  Site, StagingSchedule, StagingRecord, DeploymentRecord, ScheduledDeployment,
} from '@/lib/types'

// READ-ONLY access to the shared Supabase project. mu-sites never writes. Reads use
// the service-role key because the shared tables have no RLS policies yet (same as
// the sibling apps). Server-only — never import this into a client component.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

function getClient(): SupabaseClient | null {
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export function isConfigured(): boolean {
  return !!url && !!key
}

export async function listSites(): Promise<Site[]> {
  const db = getClient()
  if (!db) return []
  const { data, error } = await db.from('sites').select('*').order('machine_name', { ascending: true })
  if (error) console.error('[db] listSites:', error.message)
  return data ?? []
}

export async function getSite(site: string): Promise<Site | null> {
  const db = getClient()
  if (!db) return null
  const { data, error } = await db.from('sites').select('*').eq('site', site).maybeSingle()
  if (error) console.error('[db] getSite:', error.message)
  return data ?? null
}

export async function getSchedulesForSite(uuid: string): Promise<StagingSchedule[]> {
  const db = getClient()
  if (!db) return []
  const { data, error } = await db
    .from('staging_schedules')
    .select('*')
    .eq('site', uuid)
    .order('created_at', { ascending: true })
  if (error) console.error('[db] getSchedulesForSite:', error.message)
  return data ?? []
}

// staging_history keys on the Pantheon UUID.
export async function getStagingForSite(uuid: string, limit = 200): Promise<StagingRecord[]> {
  const db = getClient()
  if (!db) return []
  const { data, error } = await db
    .from('staging_history')
    .select('id, site, site_name, multidev, platform, upstream_updated, upstream_old_version, upstream_new_version, plugins_updated, themes_updated, composer_deps_updated, vrt_report_url, vrt_flagged_count, vrt_status, status, started_at, completed_at')
    .eq('site', uuid)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) console.error('[db] getStagingForSite:', error.message)
  return data ?? []
}

// deployment_history keys on the machine-name. We match on BOTH the UUID and the
// machine-name to stay correct regardless of which id a given deploy row was written
// with (the cross-app join-key gotcha — see lib/types.ts).
export async function getDeploymentsForSite(keys: string[], limit = 200): Promise<DeploymentRecord[]> {
  const db = getClient()
  if (!db) return []
  const filter = keys.filter(Boolean)
  if (!filter.length) return []
  const { data, error } = await db
    .from('deployment_history')
    .select('id, site, site_name, source, destination, stages_completed, status, started_at, completed_at')
    .in('site', filter)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) console.error('[db] getDeploymentsForSite:', error.message)
  return data ?? []
}

export async function getScheduledDeploymentsForSite(keys: string[]): Promise<ScheduledDeployment[]> {
  const db = getClient()
  if (!db) return []
  const filter = keys.filter(Boolean)
  if (!filter.length) return []
  const { data, error } = await db
    .from('scheduled_deployments')
    .select('id, site, site_name, source, destination, scheduled_for, status, consultant, notes')
    .in('site', filter)
    .in('status', ['pending', 'triggered'])
    .order('scheduled_for', { ascending: true })
  if (error) console.error('[db] getScheduledDeploymentsForSite:', error.message)
  return data ?? []
}
