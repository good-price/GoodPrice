/**
 * lib/catalog/audit/types.ts
 *
 * Types for the Daily Catalog Audit — the automated health check that
 * runs against all active products and auto-suppresses failures.
 */

import type { OverrideReason } from '@/lib/catalog/status-overrides'

export interface AuditProductDetail {
  productId:  string
  asin:       string
  healthy:    boolean
  /** Set when healthy=false and suppression was applied. */
  failReason?: OverrideReason | 'transient'
  /** All gates that failed (from the validator). */
  gatesFailed: string[]
  /** Whether this product was newly suppressed in this run. */
  newlySuppressed: boolean
  /** Whether this product recovered (was suppressed, now healthy). */
  recovered: boolean
  durationMs: number
}

export interface DailyAuditResult {
  runAt:             string   // ISO
  durationMs:        number
  totalChecked:      number
  healthy:           number
  unhealthy:         number
  transient:         number   // failed but not suppressed (transient errors)
  newlySuppressed:   number
  recovered:         number
  alreadySuppressed: number
  details:           AuditProductDetail[]
}

export interface DailyAuditLog {
  updatedAt: string
  runs:      DailyAuditResult[]
}
