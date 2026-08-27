// Display formatting. Everything the pipeline schedules on is Manila time (15:00 PHT
// staging hour, ISO weeks Mon–Sun), so the UI renders in Asia/Manila to match.

const TZ = 'Asia/Manila'

export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric',
  }).format(d)
}

export function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(d)
}

// "Aug 24–28" or "Aug 31 – Sep 4" for a Mon→Fri work-week range.
export function fmtWeekRange(mon: Date, fri: Date): string {
  const m = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short' }).format(d)
  const day = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, day: 'numeric' }).format(d)
  return m(mon) === m(fri)
    ? `${m(mon)} ${day(mon)}–${day(fri)}`
    : `${m(mon)} ${day(mon)} – ${m(fri)} ${day(fri)}`
}

export function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'long', year: 'numeric' }).format(d)
}
