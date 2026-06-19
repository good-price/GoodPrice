/**
 * lib/catalog/alerts/governance.ts
 *
 * Aggregates alert store into a governance summary — Sprint 4F.
 *
 * SERVER-ONLY.
 */

import { readAlerts } from './state'
import type { AlertGovernance } from './types'

export function getAlertGovernance(): AlertGovernance {
  const store  = readAlerts()
  const alerts = Object.values(store.alerts)
  const total  = alerts.length

  if (total === 0) {
    return { totalAlerts: 0, low: 0, medium: 0, high: 0, unresolved: 0 }
  }

  let low = 0, medium = 0, high = 0, unresolved = 0

  for (const a of alerts) {
    if (a.severity === 'low')    low++
    if (a.severity === 'medium') medium++
    if (a.severity === 'high')   high++
    if (a.resolvedAt === null)   unresolved++
  }

  return { totalAlerts: total, low, medium, high, unresolved }
}
