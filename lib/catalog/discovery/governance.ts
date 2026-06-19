/**
 * lib/catalog/discovery/governance.ts
 *
 * Discovery Governance — Sprint 4C.
 *
 * Computes pool health and discovery urgency for each category based on
 * the current candidate pool's count, quality, and confidence averages.
 *
 * Health rules:
 *   healthy:  ≥ 20 candidates
 *   warning:  5–19 candidates
 *   critical: < 5 candidates
 *
 * needsDiscovery:
 *   true when health === 'critical' OR qualityAverage < 50
 *
 * Never throws. Falls back to critical + needsDiscovery on any error.
 * SERVER-ONLY.
 */

import { loadCandidates } from './candidate-store'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PoolGovernance {
  category:          string
  candidateCount:    number
  qualityAverage:    number
  confidenceAverage: number
  health:            'healthy' | 'warning' | 'critical'
  needsDiscovery:    boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = [
  'bebes', 'belleza', 'cocina', 'deporte', 'electronica',
  'gaming', 'herramientas', 'hogar', 'mascotas', 'oficina',
] as const

const HEALTHY_THRESHOLD  = 20
const WARNING_THRESHOLD  =  5
const QUALITY_MIN_SCORE  = 50  // below this → needsDiscovery regardless of count

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns governance data for all 10 categories.
 * Loads the candidate pool once and computes averages per category.
 * Never throws — returns critical/needsDiscovery for all categories on error.
 */
export function getPoolGovernance(): PoolGovernance[] {
  try {
    const pool = loadCandidates()

    return ALL_CATEGORIES.map(category => {
      const items = pool.items.filter(c => c.category === category)
      const count = items.length

      const qualityScores    = items.map(c => c.qualityScore    ?? 0)
      const confidenceScores = items.map(c => c.confidenceScore ?? 0)

      const qualityAverage    = count > 0
        ? qualityScores.reduce((a, b) => a + b, 0)    / count
        : 0
      const confidenceAverage = count > 0
        ? confidenceScores.reduce((a, b) => a + b, 0) / count
        : 0

      const health: PoolGovernance['health'] =
        count >= HEALTHY_THRESHOLD ? 'healthy' :
        count >= WARNING_THRESHOLD ? 'warning'  :
                                     'critical'

      const needsDiscovery = health === 'critical' || qualityAverage < QUALITY_MIN_SCORE

      return {
        category,
        candidateCount:    count,
        qualityAverage:    Math.round(qualityAverage),
        confidenceAverage: Math.round(confidenceAverage),
        health,
        needsDiscovery,
      }
    })
  } catch {
    return ALL_CATEGORIES.map(category => ({
      category,
      candidateCount:    0,
      qualityAverage:    0,
      confidenceAverage: 0,
      health:            'critical' as const,
      needsDiscovery:    true,
    }))
  }
}
