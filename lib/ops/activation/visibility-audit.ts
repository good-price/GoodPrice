/**
 * lib/ops/activation/visibility-audit.ts
 *
 * Wraps the existing visibility-balancer to produce an audit result
 * with operational alerts for the Recovery Center.
 *
 * Thresholds:
 *   alertSuppressed — suppressed > 40% of catalog
 *   alertVisible    — visible < 60% of catalog
 *
 * SERVER-ONLY.
 */

import { computeVisibilityRatios } from '@/lib/catalog/stabilization/visibility-balancer'
import type { VisibilityAuditResult, VisibilityHealthStatus } from './types'

// ── Thresholds ────────────────────────────────────────────────────────────────

const ALERT_SUPPRESSED_PCT = 40   // suppressed > 40% → alert
const ALERT_VISIBLE_PCT    = 60   // visible < 60% → alert

function classifyStatus(visiblePct: number): VisibilityHealthStatus {
  if (visiblePct >= 60) return 'healthy'
  if (visiblePct >= 30) return 'degraded'
  if (visiblePct >= 10) return 'critical'
  return 'over-suppressed'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Computes a visibility audit result from current catalog state.
 * Wraps computeVisibilityRatios() and adds operational alert logic.
 */
export function computeVisibilityAudit(): VisibilityAuditResult {
  let ratios = {
    total: 0, active: 0, warning: 0, degraded: 0, suppressed: 0,
    visible: 0, visiblePct: 0, suppressedPct: 0,
    activePct: 0, warningPct: 0, degradedPct: 0,
  }

  try {
    ratios = computeVisibilityRatios()
  } catch { /* catalog not initialized yet */ }

  const suppressedPct  = ratios.total > 0
    ? Math.round((ratios.suppressed / ratios.total) * 100)
    : 0
  const visiblePct     = ratios.total > 0
    ? Math.round((ratios.visible / ratios.total) * 100)
    : 0
  const activeRatio    = ratios.visible > 0
    ? Math.round((ratios.active / ratios.visible) * 100)
    : 0

  const alertSuppressed = suppressedPct > ALERT_SUPPRESSED_PCT
  const alertVisible    = visiblePct < ALERT_VISIBLE_PCT

  const alerts: string[] = []
  if (alertSuppressed) {
    alerts.push(`${suppressedPct}% del catálogo está suprimido (umbral: ${ALERT_SUPPRESSED_PCT}%)`)
  }
  if (alertVisible) {
    alerts.push(`Solo ${visiblePct}% del catálogo es visible (mínimo recomendado: ${ALERT_VISIBLE_PCT}%)`)
  }

  return {
    computedAt:      new Date().toISOString(),
    status:          classifyStatus(visiblePct),
    total:           ratios.total,
    active:          ratios.active,
    warning:         ratios.warning,
    degraded:        ratios.degraded,
    suppressed:      ratios.suppressed,
    visiblePct,
    suppressedPct,
    activeRatio,
    alertSuppressed,
    alertVisible,
    alerts,
  }
}
