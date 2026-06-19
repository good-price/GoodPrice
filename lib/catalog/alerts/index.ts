/**
 * lib/catalog/alerts/index.ts
 *
 * Barrel + runAlertScan() coordinator — Sprint 4F.
 *
 * runAlertScan():
 *   1. generateAlerts() — evaluate conditions + dedup
 *   2. getAlertGovernance() — aggregate
 *   3. Append OPS log (catalog-alerts)
 *   4. Return result
 *
 * SERVER-ONLY.
 */

export type {
  AlertType,
  AlertSeverity,
  ProductAlert,
  AlertStore,
  AlertGovernance,
} from './types'

export {
  readAlerts,
  saveAlerts,
  resolveAlert,
  generateAlerts,
} from './state'

export {
  evaluateAlertConditions,
  alertDedupKey,
  buildAlert,
} from './engine'
export type { AlertInput, PendingAlert } from './engine'

export { getAlertGovernance } from './governance'

// ── Scan coordinator ──────────────────────────────────────────────────────────

import { generateAlerts }   from './state'
import { getAlertGovernance } from './governance'
import { readAlerts }        from './state'
import { appendLog }         from '@/lib/ops/logs'
import type { OpsLog }       from '@/lib/ops/logs/types'
import type { AlertGovernance } from './types'

export interface AlertScanResult {
  newAlerts:  number
  governance: AlertGovernance
}

export function runAlertScan(pipelineId?: string): AlertScanResult {
  const startMs   = Date.now()
  const startedAt = new Date().toISOString()

  const newAlerts  = generateAlerts()
  const governance = getAlertGovernance()
  const allAlerts  = Object.values(readAlerts().alerts)
  const durationMs = Date.now() - startMs
  const completedAt = new Date().toISOString()

  const notes = [
    `newAlerts: ${newAlerts}`,
    `total: ${governance.totalAlerts}`,
    `unresolved: ${governance.unresolved}`,
    `high: ${governance.high}`,
    `medium: ${governance.medium}`,
    `low: ${governance.low}`,
    `durationMs: ${durationMs}`,
  ].join(' | ')

  const warnings: string[] = []

  // Alert explosion: more than 30% of products have high-severity alerts
  const highAlerts = allAlerts.filter(a => a.severity === 'high' && a.resolvedAt === null).length
  if (governance.unresolved > 0 && highAlerts / governance.unresolved > 0.3) {
    warnings.push(`Explosión de alertas críticas: ${highAlerts} alertas high activas`)
  }

  if (governance.unresolved > 50) {
    warnings.push(`${governance.unresolved} alertas activas sin resolver — revisar catálogo`)
  }

  const log: OpsLog = {
    id:          pipelineId ?? `alert-scan-${Date.now()}`,
    jobType:     'catalog-alerts',
    trigger:     'pipeline',
    pipelineId,
    startedAt,
    completedAt,
    durationMs,
    status:      warnings.length > 0 ? 'partial' : 'success',
    summary:     `Alerts: ${newAlerts} new, ${governance.unresolved} unresolved (${governance.high} high)`,
    actions:     { removed: [], repaired: [], suppressed: [], recovered: [], flagged: [] },
    errors:      [],
    warnings,
    notes,
  }

  try {
    appendLog(log)
  } catch {
    // best-effort
  }

  return { newAlerts, governance }
}
