/**
 * lib/catalog/lifecycle/governance.ts
 *
 * Catalog Lifecycle Governance — Sprint 4D.
 *
 * Computes aggregate health statistics across all products in the lifecycle
 * store. Consumed by the admin UI (Zone 9) and the OPS log integration.
 *
 * SERVER-ONLY.
 */

import { readLifecycleStore } from './state'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LifecycleGovernance {
  totalProducts:      number
  healthy:            number
  aging:              number
  stale:              number
  critical:           number
  refreshNeeded:      number
  replacementNeeded:  number
  /** Integer — average ageDays across all products. */
  averageAgeDays:     number
  /** Integer — average confidenceScore across all products. */
  averageConfidence:  number
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Aggregates lifecycle health across all products in the lifecycle store.
 * Reads from the persisted store (does not sync from runtime catalog).
 * Never throws.
 */
export function getLifecycleGovernance(): LifecycleGovernance {
  const empty: LifecycleGovernance = {
    totalProducts:     0,
    healthy:           0,
    aging:             0,
    stale:             0,
    critical:          0,
    refreshNeeded:     0,
    replacementNeeded: 0,
    averageAgeDays:    0,
    averageConfidence: 0,
  }

  try {
    const store    = readLifecycleStore()
    const products = Object.values(store.products)
    if (products.length === 0) return empty

    let healthy = 0, aging = 0, stale = 0, critical = 0
    let refreshNeeded = 0, replacementNeeded = 0
    let totalAge = 0, totalConf = 0

    for (const p of products) {
      if      (p.health === 'healthy')  healthy++
      else if (p.health === 'aging')    aging++
      else if (p.health === 'stale')    stale++
      else if (p.health === 'critical') critical++

      if (p.needsRefresh)     refreshNeeded++
      if (p.needsReplacement) replacementNeeded++

      totalAge  += p.ageDays
      totalConf += p.confidenceScore
    }

    return {
      totalProducts:     products.length,
      healthy,
      aging,
      stale,
      critical,
      refreshNeeded,
      replacementNeeded,
      averageAgeDays:    Math.round(totalAge  / products.length),
      averageConfidence: Math.round(totalConf / products.length),
    }
  } catch {
    return empty
  }
}
