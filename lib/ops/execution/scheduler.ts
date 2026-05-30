/**
 * lib/ops/execution/scheduler.ts
 *
 * Scheduled job definitions for the GOODPRICE execution layer.
 *
 * This module defines the recommended schedule for each job type.
 * Actual cron scheduling is handled by Vercel Cron or the Cron API routes.
 *
 * Also provides helpers to check if a job is overdue based on its
 * last execution timestamp.
 *
 * SERVER-ONLY.
 */

import type { ExecJobType } from './types'
import { getRecentJobs }    from './queue-engine'

// ── Schedule definitions ──────────────────────────────────────────────────────

export interface ScheduleDefinition {
  jobType:         ExecJobType
  /** Human-readable description of when to run. */
  schedule:        string
  /** Interval in milliseconds between runs. */
  intervalMs:      number
  /** Whether to include this job in the daily health check. */
  healthMonitored: boolean
  description:     string
}

export const SCHEDULES: ScheduleDefinition[] = [
  {
    jobType:         'trust-recompute',
    schedule:        'Cada 6h',
    intervalMs:      6 * 60 * 60 * 1_000,
    healthMonitored: true,
    description:     'Recalcula la visibilidad del catálogo y actualiza los tiers',
  },
  {
    jobType:         'self-healing',
    schedule:        'Cada 12h',
    intervalMs:      12 * 60 * 60 * 1_000,
    healthMonitored: true,
    description:     'Archiva, recupera y repara drift en el catálogo',
  },
  {
    jobType:         'repair',
    schedule:        'Cada 24h',
    intervalMs:      24 * 60 * 60 * 1_000,
    healthMonitored: false,
    description:     'Repara imágenes stale y metadata CDN',
  },
  {
    jobType:         'live-truth',
    schedule:        'Cada 4h',
    intervalMs:      4 * 60 * 60 * 1_000,
    healthMonitored: true,
    description:     'Valida los siguientes productos en la cola de verdad',
  },
  {
    jobType:         'link-audit',
    schedule:        'Cada 24h',
    intervalMs:      24 * 60 * 60 * 1_000,
    healthMonitored: false,
    description:     'Verifica accesibilidad de páginas Amazon',
  },
  {
    jobType:         'colombia-audit',
    schedule:        'Cada 24h',
    intervalMs:      24 * 60 * 60 * 1_000,
    healthMonitored: false,
    description:     'Verifica disponibilidad de envío a Colombia',
  },
  {
    jobType:         'paapi-sync',
    schedule:        'Semanal',
    intervalMs:      7 * 24 * 60 * 60 * 1_000,
    healthMonitored: false,
    description:     'Sincroniza imágenes via PA-API',
  },
]

// ── Staleness helpers ─────────────────────────────────────────────────────────

export interface JobStaleness {
  jobType:      ExecJobType
  schedule:     string
  lastRunAt:    string | null
  ageMs:        number
  isOverdue:    boolean
  overdueBy:    number   // ms overdue, 0 if not overdue
}

/**
 * Returns staleness status for all monitored jobs.
 */
export function getJobStaleness(): JobStaleness[] {
  const recent = getRecentJobs(100)
  const now    = Date.now()

  return SCHEDULES.map(def => {
    const last = recent
      .filter(j => j.type === def.jobType && (j.status === 'completed'))
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
      [0]

    const lastRunAt = last?.completedAt ?? null
    const ageMs     = lastRunAt ? now - new Date(lastRunAt).getTime() : Infinity
    const isOverdue = ageMs > def.intervalMs
    const overdueBy = isOverdue ? ageMs - def.intervalMs : 0

    return { jobType: def.jobType, schedule: def.schedule, lastRunAt, ageMs, isOverdue, overdueBy }
  })
}

/**
 * Returns the schedule definition for a given job type.
 */
export function getSchedule(jobType: ExecJobType): ScheduleDefinition | null {
  return SCHEDULES.find(s => s.jobType === jobType) ?? null
}
