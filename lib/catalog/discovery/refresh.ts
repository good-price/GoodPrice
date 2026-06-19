/**
 * lib/catalog/discovery/refresh.ts
 *
 * Candidate Pool Refresh — Sprint 3H / 4A.
 *
 * refreshCandidatePool()        — prunes admitted ASINs from all categories
 * refreshCategoryPool(category) — prunes admitted ASINs for one category;
 *                                 if the pool is empty or low after pruning,
 *                                 runs Amazon Discovery to replenish it (4A)
 *
 * Both operations are idempotent and safe to call at any time.
 * SERVER-ONLY.
 */

import { getRuntimeProducts }          from '@/lib/catalog/runtime/reader'
import { loadCandidates, saveCandidates } from './candidate-store'
import { needsPoolRefresh }            from './pool-health'
import { runAmazonDiscovery }          from './amazon/pipeline'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Removes all discovery candidates whose ASIN is already in the runtime
 * catalog, across all categories. Idempotent. Never throws.
 */
export async function refreshCandidatePool(): Promise<void> {
  try {
    const existingAsins = new Set(getRuntimeProducts().map(p => p.asin))
    const store         = loadCandidates()
    const filtered      = store.items.filter(item => !existingAsins.has(item.asin))
    if (filtered.length < store.items.length) saveCandidates(filtered)
  } catch {
    // best-effort
  }
}

/**
 * Refreshes the candidate pool for one category:
 *   1. Prune items already admitted to the runtime catalog.
 *   2. If the pool is empty or low after pruning, run Amazon Discovery
 *      to replenish it. Discovery failure is silently swallowed so that
 *      Auto Fill can continue with whatever candidates remain.
 *
 * Idempotent. Never throws.
 */
export async function refreshCategoryPool(category: string): Promise<void> {
  try {
    // Step 1: prune already-admitted ASINs for this category
    const existingAsins = new Set(getRuntimeProducts().map(p => p.asin))
    const store         = loadCandidates()
    const filtered      = store.items.filter(
      item => item.category !== category || !existingAsins.has(item.asin),
    )
    if (filtered.length < store.items.length) saveCandidates(filtered)
  } catch {
    // prune failure — continue to discovery attempt below
  }

  // Step 2: if pool is still low/empty, run Amazon Discovery to replenish
  try {
    if (needsPoolRefresh(category)) {
      await runAmazonDiscovery(category)
    }
  } catch {
    // Discovery failure must never break Auto Fill — swallow silently
  }
}
