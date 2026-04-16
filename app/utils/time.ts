/** Returns the current time as a Date in IST (UTC+5:30) */
export function getIST(): Date {
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
  return new Date(utcMs + 19800000) // +5h30m = 19 800 000 ms
}

/** True if the Indian equity market is currently open (9:15–15:30, Mon–Fri) */
export function isMarketOpen(): boolean {
  const ist = getIST()
  const day = ist.getDay()
  if (day === 0 || day === 6) return false
  const mins = ist.getHours() * 60 + ist.getMinutes()
  return mins >= 555 && mins <= 930 // 9:15 to 15:30
}

/** Format a Date as "Mon, 15 Apr 2026" in IST locale */
export function formatISTDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Format a Date as "09:20 AM" */
export function formatISTTime(d: Date): string {
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Returns human-readable countdown from now to the intraday cutoff (15:00 IST).
 * Returns null if the cutoff has already passed today.
 */
export function countdownTo3PM(): string | null {
  const ist = getIST()
  const cutoff = new Date(ist)
  cutoff.setHours(15, 0, 0, 0)
  const diffMs = cutoff.getTime() - ist.getTime()
  if (diffMs <= 0) return null
  const h = Math.floor(diffMs / 3600000)
  const m = Math.floor((diffMs % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m to cutoff` : `${m}m to cutoff`
}

/** True if the current IST time is past 13:30 (1:30 PM) */
export function isPastCutoffWarning(): boolean {
  const ist = getIST()
  return ist.getHours() * 60 + ist.getMinutes() >= 810
}
