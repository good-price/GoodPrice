/**
 * lib/ops/activation/trm-monitor.ts
 *
 * Reads the current TRM (Tasa Representativa del Mercado, USD→COP)
 * and generates alerts when it's stale or using a fallback source.
 *
 * All COP price conversions in GOODPRICE must use the live TRM.
 * This module monitors its freshness and generates actionable warnings.
 *
 * SERVER-ONLY.
 */

import { getRateMeta, DISK_TTL_HOURS } from '@/lib/currency/cache'
import type { TrmMonitorStatus, TrmFreshnessLabel } from './types'

const STALE_ALERT_HOURS = 24   // alert if TRM > 24h old

function classifyFreshness(ageHours: number, isFallback: boolean): TrmFreshnessLabel {
  if (isFallback)       return 'unknown'
  if (ageHours < 6)     return 'fresh'
  if (ageHours < 12)    return 'aging'
  if (ageHours < 48)    return 'stale'
  return 'stale'
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getTrmMonitorStatus(): TrmMonitorStatus {
  const meta = getRateMeta()

  const ageHours = meta.fetchedAt
    ? Math.round((Date.now() - new Date(meta.fetchedAt).getTime()) / 3_600_000)
    : DISK_TTL_HOURS + 1   // unknown age → treat as stale

  const isStale      = ageHours > DISK_TTL_HOURS || meta.isExpired
  const freshnessLabel = classifyFreshness(ageHours, meta.isFallback)
  const alertStale   = ageHours > STALE_ALERT_HOURS
  const alertFallback = meta.isFallback

  return {
    computedAt:     new Date().toISOString(),
    rate:           meta.rate,
    source:         meta.source,
    fetchedAt:      meta.fetchedAt,
    expiresAt:      meta.expiresAt,
    ageHours,
    isStale,
    isFallback:     meta.isFallback,
    freshnessLabel,
    alertStale,
    alertFallback,
  }
}
