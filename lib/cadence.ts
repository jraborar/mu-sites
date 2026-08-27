import type { StagingSchedule } from '@/lib/types'

// Cadence math for the staging scheduler: when is a schedule due, and when does it
// next come round. Pure Manila-timezone date logic with no I/O.
//
// ⚠️ COPY of mu-wp-staging/lib/cadence.ts — this is the source of truth for window
// math and mu-sites must compute windows identically. The ONLY deltas from the
// original are (1) the import path above (@/lib/types) and (2) `isoWeekMonday`,
// `getManilaMonthDay`, `parseAnchor` and `weekTarget` are exported here so
// lib/cards.ts can reuse them. Re-sync on any cadence change upstream.

function getManilaDate(date: Date): Date {
  const str = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date)
  return new Date(`${str}T00:00:00+08:00`)
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Day of week in Manila: 0=Sun … 6=Sat (the encoding staging_schedules.day_of_week uses).
export function manilaDayOfWeek(date: Date): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short' }).format(date)
  return Math.max(0, WEEKDAYS.indexOf(short))
}

export function getManilaMonthDay(date: Date): { month: number; day: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)
  return {
    month: parseInt(parts.find(p => p.type === 'month')?.value ?? '1', 10),
    day:   parseInt(parts.find(p => p.type === 'day')?.value ?? '1', 10),
    year:  parseInt(parts.find(p => p.type === 'year')?.value ?? '2025', 10),
  }
}

// Staging runs at 15:00 PHT — shift-start time, safely after morning deployments.
function manilaDate(year: number, month: number, day: number): Date {
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return new Date(`${year}-${m}-${d}T15:00:00+08:00`)
}

// Snap a Manila-midnight date to the 15:00 PHT staging hour on the same Manila day.
function atStagingHour(date: Date): Date {
  const { year, month, day } = getManilaMonthDay(date)
  return manilaDate(year, month, day)
}

// Returns the Nth occurrence (1-based, or -1 for last) of dayOfWeek in the given month/year.
function nthWeekdayInMonth(year: number, month: number, dayOfWeek: number, n: number): Date | null {
  const firstDay = manilaDate(year, month, 1)
  const firstDow = manilaDayOfWeek(firstDay)
  const offset = (dayOfWeek - firstDow + 7) % 7
  const firstOccurrence = addDays(firstDay, offset)

  if (n === -1) {
    let candidate = firstOccurrence
    let next = addDays(candidate, 7)
    while (getManilaMonthDay(next).month === month) {
      candidate = next
      next = addDays(next, 7)
    }
    return candidate
  }

  const result = addDays(firstOccurrence, (n - 1) * 7)
  return getManilaMonthDay(result).month === month ? result : null
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Returns Monday of the ISO week containing the given date (Manila time)
export function isoWeekMonday(date: Date): Date {
  const dow = manilaDayOfWeek(date) // 0=Sun … 6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  return getManilaDate(addDays(date, mondayOffset))
}

export function isoWeekMondayStr(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(isoWeekMonday(date))
}

function weekSpan(fromMonday: Date, toMonday: Date): number {
  return Math.round((toMonday.getTime() - fromMonday.getTime()) / WEEK_MS)
}

function addWeeks(monday: Date, weeks: number): Date {
  return new Date(monday.getTime() + weeks * WEEK_MS)
}

export function parseAnchor(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+08:00`) : new Date(value)
}

function sameWeek(a: Date, b: Date): boolean {
  return isoWeekMonday(a).getTime() === isoWeekMonday(b).getTime()
}

function intervalWeeks(cadence: StagingSchedule['cadence']): number | null {
  return cadence === 'weekly' ? 1 : cadence === 'biweekly' ? 2 : null
}

export function weekTarget(monday: Date, dayOfWeek: number): Date {
  return atStagingHour(addDays(monday, dayOfWeek === 0 ? 6 : dayOfWeek - 1))
}

function parityAnchor(
  sched: StagingSchedule,
  lastDeployment?: string | null,
): { monday: Date; fromCompletion: boolean } | null {
  const completed = lastDeployment ? isoWeekMonday(parseAnchor(lastDeployment)) : null
  const reference = sched.biweekly_reference_date ? isoWeekMonday(parseAnchor(sched.biweekly_reference_date)) : null
  if (completed && (!reference || reference.getTime() <= completed.getTime())) {
    return { monday: completed, fromCompletion: true }
  }
  if (reference) return { monday: reference, fromCompletion: false }
  if (sched.created_at) return { monday: isoWeekMonday(new Date(sched.created_at)), fromCompletion: false }
  return null
}

function monthOccurrence(sched: StagingSchedule, year: number, month: number): Date | null {
  if (sched.cadence === 'monthly') {
    if (sched.day_of_week == null || sched.week_of_month == null) return null
    return nthWeekdayInMonth(year, month, sched.day_of_week, sched.week_of_month)
  }
  if (sched.cadence === 'bimonthly-week-of-15') {
    if (sched.bimonthly_ref_month == null || sched.bimonthly_day_of_week == null) return null
    const monthsFromRef = (((month - sched.bimonthly_ref_month) % 12) + 12) % 12
    if (monthsFromRef % 2 !== 0) return null
    return weekTarget(isoWeekMonday(manilaDate(year, month, 15)), sched.bimonthly_day_of_week)
  }
  return null
}

function monthsInWeek(monday: Date): { year: number; month: number }[] {
  const a = getManilaMonthDay(monday)
  const b = getManilaMonthDay(addDays(monday, 6))
  return a.year === b.year && a.month === b.month ? [a] : [a, b]
}

// The scheduled moment inside the CURRENT ISO week, or null when this week isn't an
// on-cadence week.
export function currentWindowTarget(
  sched: StagingSchedule,
  lastDeployment?: string | null,
  now: Date = new Date(),
): Date | null {
  const thisMonday = isoWeekMonday(now)
  const weeks = intervalWeeks(sched.cadence)

  if (weeks) {
    if (sched.day_of_week == null) return null
    const anchor = parityAnchor(sched, lastDeployment)
    if (!anchor) return null
    const span = weekSpan(anchor.monday, thisMonday)
    if (span < (anchor.fromCompletion ? weeks : 0) || span % weeks !== 0) return null
    return weekTarget(thisMonday, sched.day_of_week)
  }

  for (const { year, month } of monthsInWeek(thisMonday)) {
    const occ = monthOccurrence(sched, year, month)
    if (occ && sameWeek(occ, thisMonday)) return occ
  }
  return null
}

// Next FUTURE occurrence after `after`.
export function computeNextOccurrence(
  sched: StagingSchedule,
  after: Date,
  lastDeployment?: string | null,
): Date | null {
  if (sched.cadence === 'security-only' || sched.cadence === 'once') return null

  const weeks = intervalWeeks(sched.cadence)
  if (weeks) {
    if (sched.day_of_week == null) return null
    const anchor = parityAnchor(sched, lastDeployment)
    if (!anchor) return null
    const minSpan = anchor.fromCompletion ? weeks : 0
    let span = Math.max(minSpan, weekSpan(anchor.monday, isoWeekMonday(after)))
    span = Math.ceil(span / weeks) * weeks
    for (let i = 0; i < 106; i++, span += weeks) {
      const target = weekTarget(addWeeks(anchor.monday, span), sched.day_of_week)
      if (target > after) return target
    }
    return null
  }

  const { year: startYear, month: startMonth } = getManilaMonthDay(after)
  for (let i = 0; i < 25; i++) {
    const month = ((startMonth - 1 + i) % 12) + 1
    const year  = startYear + Math.floor((startMonth - 1 + i) / 12)
    const occ = monthOccurrence(sched, year, month)
    if (occ && occ > after) return occ
  }
  return null
}
