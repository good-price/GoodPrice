/**
 * lib/catalog/discovery/pool-health.ts
 *
 * Candidate Pool Health — Sprint 3H.
 *
 * Reports the health of the discovery candidate pool relative to the
 * current runtime catalog. "Net-new" candidates are those whose ASIN
 * is NOT already present in the runtime catalog.
 *
 * SERVER-ONLY.
 */

import { getRuntimeProducts } from '@/lib/catalog/runtime/reader'
import { loadCandidates }     from './candidate-store'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Category is "low" when it has fewer than this many net-new candidates. */
export const LOW_THRESHOLD = 5

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CandidatePoolStats {
  /** Total net-new candidates across all categories. */
  totalCandidates:  number
  /** Net-new candidate count per category slug. */
  byCategory:       Record<string, number>
  /** Category slugs with 0 net-new candidates. */
  emptyCategories:  string[]
  /** Category slugs with > 0 but < LOW_THRESHOLD net-new candidates. */
  lowCategories:    string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNetNewByCategory(): Record<string, number> {
  try {
    const existingAsins = new Set(getRuntimeProducts().map(p => p.asin))
    const store         = loadCandidates()
    const counts: Record<string, number> = {}
    for (const item of store.items) {
      if (!existingAsins.has(item.asin)) {
        counts[item.category] = (counts[item.category] ?? 0) + 1
      }
    }
    return counts
  } catch {
    return {}
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns health stats for the discovery candidate pool.
 * Net-new = candidates whose ASIN is not in the runtime catalog.
 * Never throws.
 */
export function getCandidatePoolStats(): CandidatePoolStats {
  try {
    const byCategory      = getNetNewByCategory()
    const totalCandidates = Object.values(byCategory).reduce((s, n) => s + n, 0)
    const emptyCategories = Object.entries(byCategory)
      .filter(([, n]) => n === 0)
      .map(([cat]) => cat)
    const lowCategories   = Object.entries(byCategory)
      .filter(([, n]) => n > 0 && n < LOW_THRESHOLD)
      .map(([cat]) => cat)
    return { totalCandidates, byCategory, emptyCategories, lowCategories }
  } catch {
    return { totalCandidates: 0, byCategory: {}, emptyCategories: [], lowCategories: [] }
  }
}

/**
 * Returns true if the category has no net-new candidates in the pool.
 * Never throws.
 */
export function isCategoryPoolEmpty(category: string): boolean {
  try {
    const counts = getNetNewByCategory()
    return (counts[category] ?? 0) === 0
  } catch {
    return true
  }
}

/**
 * Returns true if the category has fewer than LOW_THRESHOLD net-new candidates.
 * Never throws.
 */
export function isCategoryPoolLow(category: string): boolean {
  try {
    const counts = getNetNewByCategory()
    const n      = counts[category] ?? 0
    return n > 0 && n < LOW_THRESHOLD
  } catch {
    return false
  }
}

/**
 * Returns true if the candidate pool for this category should be refreshed
 * (i.e., already-admitted ASINs pruned) before the next fill attempt.
 * Never throws.
 */
export function needsPoolRefresh(category: string): boolean {
  return isCategoryPoolEmpty(category) || isCategoryPoolLow(category)
}
