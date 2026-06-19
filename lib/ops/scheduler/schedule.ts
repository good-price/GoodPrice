/**
 * lib/ops/scheduler/schedule.ts
 *
 * Registry of all scheduled jobs in GOODPRICE OPS V3.
 * This is the single source of truth for job intervals and metadata.
 *
 * Jobs listed here must match the OpsJobType union in lib/ops/logs/types.ts.
 *
 * SERVER-ONLY.
 */

import type { ScheduledJobConfig } from './types'
import type { OpsJobType }         from '../logs/types'

export const JOB_SCHEDULES: ScheduledJobConfig[] = [
  // ── Master Cycle jobs (run as part of the 3AM pipeline) ──────────────────
  {
    jobType:         'trust-recompute',
    label:           'Trust Recompute',
    description:     'Recalcula la visibilidad del catálogo y actualiza los tiers',
    intervalMs:      6 * 60 * 60_000,    // 6h
    schedule:        'Cada 6h',
    partOfCycle:     true,
    healthMonitored: true,
  },
  {
    jobType:         'self-healing',
    label:           'Self-Healing',
    description:     'Archiva, recupera y repara drift automáticamente en el catálogo',
    intervalMs:      12 * 60 * 60_000,   // 12h
    schedule:        'Cada 12h',
    partOfCycle:     true,
    healthMonitored: true,
  },
  {
    jobType:         'live-truth',
    label:           'Live Truth',
    description:     'Valida precios, títulos e imágenes contra Amazon en tiempo real',
    intervalMs:      4 * 60 * 60_000,    // 4h
    schedule:        'Cada 4h',
    partOfCycle:     true,
    healthMonitored: true,
  },
  {
    jobType:         'link-audit',
    label:           'Link Audit',
    description:     'Verifica accesibilidad de páginas Amazon (Gate 9)',
    intervalMs:      24 * 60 * 60_000,   // 24h
    schedule:        'Cada 24h',
    partOfCycle:     true,
    healthMonitored: false,
  },
  {
    jobType:         'colombia-audit',
    label:           'Colombia Audit',
    description:     'Verifica disponibilidad de envío a Colombia',
    intervalMs:      24 * 60 * 60_000,   // 24h
    schedule:        'Cada 24h',
    partOfCycle:     true,
    healthMonitored: false,
  },
  {
    jobType:         'repair',
    label:           'Repair',
    description:     'Repara imágenes stale y metadata CDN (cdn_swap → amazon_page → paapi)',
    intervalMs:      24 * 60 * 60_000,   // 24h
    schedule:        'Cada 24h',
    partOfCycle:     true,
    healthMonitored: false,
  },

  // ── Standalone jobs (run independently of the cycle) ─────────────────────
  {
    jobType:         'paapi-sync',
    label:           'PA-API Sync',
    description:     'Sincroniza imágenes de alta resolución vía Amazon Product Advertising API',
    intervalMs:      7 * 24 * 60 * 60_000,  // 7 days
    schedule:        'Semanal',
    partOfCycle:     false,
    healthMonitored: false,
  },
  {
    jobType:         'trm-update',
    label:           'TRM Update',
    description:     'Actualiza la Tasa Representativa del Mercado USD→COP',
    intervalMs:      6 * 60 * 60_000,    // 6h
    schedule:        'Cada 6h',
    partOfCycle:     false,
    healthMonitored: false,
  },
]

/**
 * Returns the schedule configuration for a given job type.
 * Returns null if the job type is not registered (e.g., 'cycle-3am', 'manual-action').
 */
export function getJobSchedule(jobType: OpsJobType): ScheduledJobConfig | null {
  return JOB_SCHEDULES.find(s => s.jobType === jobType) ?? null
}
