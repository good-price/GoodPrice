/**
 * lib/ops/scheduler/countdown.ts
 *
 * Timezone-aware countdown engine for GOODPRICE OPS V3.
 *
 * Computes nextRunAt, remainingMs, and isOverdue for:
 *   - Individual scheduled jobs (based on lastRunAt + intervalMs)
 *   - The Master Cycle (next 03:00 AM America/Bogota)
 *
 * Colombia does not observe DST — America/Bogota is permanently UTC-5.
 * All time arithmetic uses this fixed offset for correctness and simplicity.
 *
 * SERVER-ONLY.
 */

import { getLastLogByJobType, getLastCycleIndexEntry } from '../logs/reader'
import { MASTER_CYCLE }    from '../cycle/definition'
import { JOB_SCHEDULES }   from './schedule'
import type {
  JobCountdown,
  CycleCountdown,
  AllCountdowns,
} from './types'
import type { OpsJobType } from '../logs/types'

// ── Timezone constant ─────────────────────────────────────────────────────────

/** Colombia — America/Bogota. UTC-5, no DST, fixed offset. */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Returns the UTC timestamp (ms) of the next occurrence of
 * `scheduleHour:00:00` in America/Bogota.
 *
 * Algorithm:
 *   1. Shift now to "Bogota clock" by subtracting BOGOTA_OFFSET_MS.
 *   2. Set the Bogota clock to scheduleHour:00:00 today.
 *   3. Shift back to real UTC by adding BOGOTA_OFFSET_MS.
 *   4. If that timestamp is already past, advance by 24h.
 */
function nextBogotaHourMs(scheduleHour: number): number {
  const nowMs    = Date.now()

  // Step into Bogota "clock space" (treating Bogota local time as UTC values)
  const bogotaMs = nowMs - BOGOTA_OFFSET_MS
  const bogota   = new Date(bogotaMs)

  // Build target: scheduleHour:00:00 on the same Bogota calendar day
  const target = new Date(bogota)
  target.setUTCHours(scheduleHour, 0, 0, 0)

  // Step back out to real UTC
  let utcTargetMs = target.getTime() + BOGOTA_OFFSET_MS

  // If the target is in the past (or exactly now), advance by one day
  if (utcTargetMs <= nowMs) {
    utcTargetMs += 24 * 60 * 60 * 1000
  }

  return utcTargetMs
}

/**
 * Computes nextRunAt for a job given its last completed run and interval.
 * If never run, returns null (callers may choose to treat as overdue).
 */
function computeNextRunAt(
  lastRunAt:  string | null,
  intervalMs: number,
): string | null {
  if (!lastRunAt) return null
  const next = new Date(lastRunAt).getTime() + intervalMs
  return new Date(next).toISOString()
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the countdown state for a single job type.
 */
export function getJobCountdown(jobType: OpsJobType): JobCountdown | null {
  const config = JOB_SCHEDULES.find(s => s.jobType === jobType)
  if (!config) return null

  const lastLog    = getLastLogByJobType(jobType)
  const lastRunAt  = lastLog?.completedAt ?? null
  const nextRunAt  = computeNextRunAt(lastRunAt, config.intervalMs)
  const now        = Date.now()

  const remainingMs = nextRunAt
    ? new Date(nextRunAt).getTime() - now
    : -Infinity

  return {
    jobType:        config.jobType,
    label:          config.label,
    schedule:       config.schedule,
    description:    config.description,
    partOfCycle:    config.partOfCycle,
    lastRunAt,
    nextRunAt,
    remainingMs:    nextRunAt ? remainingMs : 0,
    isOverdue:      nextRunAt ? remainingMs < 0 : false,
    lastStatus:     lastLog?.status  ?? null,
    lastDurationMs: lastLog?.durationMs ?? null,
  }
}

/**
 * Returns the countdown state for the Master Cycle (next 03:00 AM Bogota).
 */
export function getCycleCountdown(): CycleCountdown {
  const nextCycleMs = nextBogotaHourMs(MASTER_CYCLE.scheduleHour)
  const now         = Date.now()
  const remainingMs = nextCycleMs - now

  const lastEntry = getLastCycleIndexEntry()

  return {
    nextCycleAt:    new Date(nextCycleMs).toISOString(),
    remainingMs,
    isOverdue:      remainingMs < 0,
    lastRunAt:      lastEntry?.lastCycleAt      ?? null,
    lastStatus:     lastEntry?.cycleStatus      ?? null,
    lastDurationMs: lastEntry?.cycleDurationMs  ?? null,
  }
}

/**
 * Returns countdown state for all registered jobs plus the Master Cycle.
 * Suitable for powering the Automation Center dashboard.
 */
export function getAllCountdowns(): AllCountdowns {
  return {
    cycle: getCycleCountdown(),
    jobs:  JOB_SCHEDULES.map(cfg => getJobCountdown(cfg.jobType)).filter(
      (c): c is JobCountdown => c !== null,
    ),
  }
}

/**
 * Formats a remaining ms duration as HH:MM:SS.
 * Negative values (overdue) are formatted as "-HH:MM:SS".
 */
export function formatCountdown(remainingMs: number): string {
  const abs     = Math.abs(remainingMs)
  const sign    = remainingMs < 0 ? '-' : ''
  const seconds = Math.floor(abs / 1000) % 60
  const minutes = Math.floor(abs / 60_000) % 60
  const hours   = Math.floor(abs / 3_600_000)

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${sign}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}
