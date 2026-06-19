/**
 * lib/ops/time/timezone.ts
 *
 * Timezone-aware time utilities anchored to America/Bogota.
 *
 * Design invariants:
 *   - Never reads process.env.TZ or assumes any server timezone.
 *   - All local-time operations use Intl.DateTimeFormat with explicit timeZone.
 *   - UTC timestamps are the canonical representation everywhere.
 *   - getNextOccurrenceAtHour() uses an offset-inference algorithm that works
 *     for any IANA timezone without manual UTC offsets.
 *
 * Algorithm for getNextOccurrenceAtHour():
 *   1. Read current local date + hour in the target TZ.
 *   2. If current local hour >= target, advance to the next calendar day (in TZ).
 *   3. Anchor to noon UTC on that calendar date; read the TZ-local hour at noon.
 *      → This gives us the effective UTC offset: utcOffset = localNoonHour - 12.
 *   4. Compute the UTC hour for the target local hour:
 *      utcHour = targetHour + 12 − localNoonHour.
 *      Date.UTC() handles utcHour < 0 or > 23 by rolling the date automatically.
 *
 * Why noon UTC? For any timezone in [UTC−12, UTC+12], noon UTC maps to the same
 * calendar day in that timezone. America/Bogota (UTC−5) maps noon UTC → 7 AM local,
 * so noon UTC is always a safe anchor for the target date.
 *
 * SERVER-ONLY.
 */

import type { BogotaDateComponents } from './types'

export const BOGOTA_TZ = 'America/Bogota'

// ── Internal helpers ──────────────────────────────────────────────────────────

type DateTimeParts = Record<string, number>

function parseIntlParts(date: Date, timezone: string, options: Intl.DateTimeFormatOptions): DateTimeParts {
  const parts = new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone }).formatToParts(date)
  const result: DateTimeParts = {}
  for (const p of parts) {
    if (p.type !== 'literal') {
      // Normalize '24' → 0 (some Intl implementations emit '24' for midnight)
      result[p.type] = p.value === '24' ? 0 : parseInt(p.value, 10)
    }
  }
  return result
}

function twoDigit(n: number): string {
  return String(n).padStart(2, '0')
}

// ── Bogota-specific helpers ───────────────────────────────────────────────────

/**
 * Returns the current UTC instant as a Date.
 * (Always equal to `new Date()`, provided for symmetry.)
 */
export function getBogotaNow(): Date {
  return new Date()
}

/**
 * Decomposes the current UTC instant into Bogota date/time components.
 * Never reads the server's local timezone.
 */
export function getBogotaDate(from: Date = new Date()): BogotaDateComponents {
  const p = parseIntlParts(from, BOGOTA_TZ, {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  })

  const year   = p['year']
  const month  = p['month']   // 1–12
  const day    = p['day']
  const hour   = p['hour']    // already normalized (24 → 0)
  const minute = p['minute']
  const second = p['second']

  const dateString    = `${year}-${twoDigit(month)}-${twoDigit(day)}`
  const timeString    = `${twoDigit(hour)}:${twoDigit(minute)}:${twoDigit(second)}`
  const localISOString = `${dateString}T${timeString}`

  return { year, month, day, hour, minute, second, dateString, timeString, localISOString }
}

/**
 * Returns the current UTC ISO string (e.g. "2026-06-18T08:00:00.000Z").
 * Equivalent to new Date().toISOString() — explicit for testability.
 */
export function getBogotaISOString(from: Date = new Date()): string {
  return from.toISOString()
}

/**
 * Returns the current hour (0–23) in America/Bogota.
 */
export function getBogotaHour(from: Date = new Date()): number {
  return getBogotaDate(from).hour
}

// ── Next-occurrence scheduler ─────────────────────────────────────────────────

/**
 * Returns the next UTC instant at which the clock in `timezone` shows `targetHour:00:00`.
 *
 * If the current local hour is already >= targetHour, returns tomorrow's occurrence.
 * If the current local hour is exactly targetHour, also returns tomorrow (not "now").
 *
 * Works correctly for any IANA timezone, including DST timezones.
 * Does NOT rely on the server's local timezone.
 */
export function getNextOccurrenceAtHour(
  targetHour: number,
  timezone:   string,
  from:       Date = new Date(),
): Date {
  // ── Step 1: current local date + hour in target TZ ───────────────────────

  const nowParts = parseIntlParts(from, timezone, {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', hour12: false,
  })

  const localYear  = nowParts['year']
  const localMonth = nowParts['month']  // 1-based
  const localDay   = nowParts['day']
  const localHour  = nowParts['hour']   // already normalized

  // ── Step 2: candidate local date ─────────────────────────────────────────

  let targetLocalYear:  number
  let targetLocalMonth: number
  let targetLocalDay:   number

  if (localHour >= targetHour) {
    // Current local hour is at or past the target — next occurrence is tomorrow.
    //
    // Advance via the LOCAL calendar date, not from the UTC instant.
    // Anchor: noon UTC on today's LOCAL date (always the same calendar day in any
    // UTC offset ≤ ±12h). Add exactly 24h to reach tomorrow's noon UTC, then read
    // the TZ-local date at that point.
    //
    // Why not `from + 26h`? When `from` is already close to UTC midnight (e.g.
    // 23:59 Bogota = 04:59 UTC), adding 26h skips 2 calendar days in some TZs.
    const todayNoonUTC    = new Date(Date.UTC(localYear, localMonth - 1, localDay, 12, 0, 0))
    const tomorrowNoonUTC = new Date(todayNoonUTC.getTime() + 24 * 60 * 60 * 1000)
    const nextParts = parseIntlParts(tomorrowNoonUTC, timezone, {
      year: 'numeric', month: 'numeric', day: 'numeric',
    })
    targetLocalYear  = nextParts['year']
    targetLocalMonth = nextParts['month']
    targetLocalDay   = nextParts['day']
  } else {
    targetLocalYear  = localYear
    targetLocalMonth = localMonth
    targetLocalDay   = localDay
  }

  // ── Step 3: infer UTC offset via a noon-UTC anchor ────────────────────────
  //
  // At noon UTC (12:00:00Z), the local hour in the target TZ is `localNoonHour`.
  // For any TZ in [UTC−12, UTC+12], noon UTC always falls on the same calendar
  // date as the target local date, making it a stable anchor.
  //
  // UTC offset (hours) = localNoonHour − 12
  // UTC hour for targetHour local = targetHour − utcOffset
  //                               = targetHour − (localNoonHour − 12)
  //                               = targetHour + 12 − localNoonHour
  //
  // Date.UTC() auto-rolls the date when utcHour < 0 or > 23.

  const noonUTC = new Date(Date.UTC(targetLocalYear, targetLocalMonth - 1, targetLocalDay, 12, 0, 0))

  const noonParts      = parseIntlParts(noonUTC, timezone, { hour: 'numeric', hour12: false })
  const localNoonHour  = noonParts['hour']  // already normalized

  const utcHour = targetHour + 12 - localNoonHour

  return new Date(Date.UTC(targetLocalYear, targetLocalMonth - 1, targetLocalDay, utcHour, 0, 0))
}

// ── Date arithmetic ───────────────────────────────────────────────────────────

/**
 * Returns the whole number of days between two dates (|b − a| / msPerDay).
 * Always non-negative.
 */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000))
}

// ── Duration formatting ───────────────────────────────────────────────────────

/**
 * Formats a duration in milliseconds as a compact human-readable string.
 *
 * Examples:
 *   45000          → "45s"
 *   125000         → "2m 5s"
 *   7325000        → "2h 2m"
 *   90061000       → "1d 1h"
 *   0              → "0s"
 *   negative       → "0s"
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0s'

  const totalSeconds = Math.floor(ms / 1000)
  const days    = Math.floor(totalSeconds / 86400)
  const hours   = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0)    return hours   > 0 ? `${days}d ${hours}h`    : `${days}d`
  if (hours > 0)   return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  return `${seconds}s`
}
