/**
 * lib/ops/time/countdown.ts
 *
 * Countdown engine for GOODPRICE OPS V3.
 *
 * Computes time remaining until a target ISO timestamp.
 * Prepared for UI consumption — all durations broken down into
 * days / hours / minutes / seconds.
 *
 * All functions accept an optional `from` date for testability.
 * When omitted, `new Date()` (current UTC instant) is used.
 *
 * SERVER-ONLY.
 */

import type { RemainingDuration } from './types'

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Returns milliseconds remaining until `targetISO`.
 * Negative when the target is in the past.
 */
export function getRemainingMs(targetISO: string, from: Date = new Date()): number {
  return new Date(targetISO).getTime() - from.getTime()
}

/**
 * Returns whole seconds remaining until `targetISO`.
 * Negative when the target is in the past (floors toward −∞).
 */
export function getRemainingSeconds(targetISO: string, from: Date = new Date()): number {
  return Math.floor(getRemainingMs(targetISO, from) / 1000)
}

/**
 * Returns a structured breakdown of the remaining time until `targetISO`.
 *
 * When the target is in the past, all numeric fields are 0 and `isPast` is true.
 *
 * Fields:
 *   days    — whole days remaining
 *   hours   — remaining hours after whole days  (0–23)
 *   minutes — remaining minutes after whole hours (0–59)
 *   seconds — remaining seconds after whole minutes (0–59)
 *   totalMs — raw remaining ms (negative when past)
 *   isPast  — true when target is already in the past
 */
export function getRemainingDuration(targetISO: string, from: Date = new Date()): RemainingDuration {
  const totalMs = getRemainingMs(targetISO, from)

  if (totalMs <= 0) {
    return { totalMs, days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true }
  }

  const totalSeconds = Math.floor(totalMs / 1000)
  const days    = Math.floor(totalSeconds / 86400)
  const hours   = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return { totalMs, days, hours, minutes, seconds, isPast: false }
}
