// Shared MU app registry + context-aware switcher config.
// Mirrors mu-wp-staging / mu-deployment / mu-vrt, plus a 4th "sites" entry for this
// per-site dashboard. Keep the shared entries in sync with the other apps.

export type AppKey = 'staging' | 'deployment' | 'vrt' | 'sites'

export interface AppDef {
  key: AppKey
  label: string
  url: string
}

export const APPS: Record<AppKey, AppDef> = {
  staging:    { key: 'staging',    label: 'Staging',    url: 'https://mu-wp-staging-production.up.railway.app' },
  deployment: { key: 'deployment', label: 'Deployment', url: 'https://mu-deployment-production.up.railway.app' },
  vrt:        { key: 'vrt',        label: 'VRT',        url: 'https://mu-vrt-production.up.railway.app' },
  // Local-first for now — no Railway service yet.
  sites:      { key: 'sites',      label: 'Sites',      url: 'http://localhost:3005' },
}

// Which switcher entries each app shows. Sites is a read-only hub that links out to
// all three source apps.
export const SWITCHER: Record<AppKey, AppKey[]> = {
  staging:    ['staging', 'vrt'],
  deployment: ['deployment', 'vrt'],
  vrt:        ['staging', 'deployment', 'vrt'],
  sites:      ['sites', 'staging', 'deployment', 'vrt'],
}
