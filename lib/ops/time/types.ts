/**
 * lib/ops/time/types.ts
 *
 * Core types for the GOODPRICE OPS V3 Time Utilities.
 *
 * All date/time logic is anchored to America/Bogota (UTC-5, no DST).
 * UTC timestamps are used as the canonical representation everywhere;
 * Bogota components are derived from them via Intl.DateTimeFormat.
 *
 * SERVER-ONLY.
 */

// ── Bogota date components ────────────────────────────────────────────────────

/** All fields derived from the current UTC instant formatted in America/Bogota. */
export interface BogotaDateComponents {
  year:   number
  month:  number   // 1–12
  day:    number   // 1–31
  hour:   number   // 0–23
  minute: number   // 0–59
  second: number   // 0–59

  /** YYYY-MM-DD formatted in America/Bogota. */
  dateString: string
  /** HH:MM:SS formatted in America/Bogota. */
  timeString: string
  /** YYYY-MM-DDTHH:MM:SS (no offset suffix — local time, not UTC). */
  localISOString: string
}

// ── Countdown result ──────────────────────────────────────────────────────────

export interface RemainingDuration {
  /** Raw milliseconds remaining. Negative when target is in the past. */
  totalMs:  number
  /** Whole days. 0 when < 1 day or target is past. */
  days:     number
  /** Remaining hours after whole days. 0–23. */
  hours:    number
  /** Remaining minutes after whole hours. 0–59. */
  minutes:  number
  /** Remaining seconds after whole minutes. 0–59. */
  seconds:  number
  /** True when the target date is already in the past. */
  isPast:   boolean
}
