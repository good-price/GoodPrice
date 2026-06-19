/**
 * lib/catalog/recommendations/state.ts
 *
 * Recommendation store persistence — Sprint 4F.
 *
 * Persists to data/catalog/recommendations.json.
 * OPS V3 atomic write (tmp → rename).
 * Fault-tolerant reads — never throw.
 *
 * rebuildRecommendations():
 *   Joins runtime catalog + lifecycle store + intelligence store.
 *   Recomputes all recommendation scores from scratch.
 *   Single atomic write.
 *
 * SERVER-ONLY.
 */

import path from 'path'
import { storage } from '@/lib/storage/StorageFactory'
import { getRuntimeProducts }        from '@/lib/catalog/runtime/reader'
import { readLifecycleStore }        from '@/lib/catalog/lifecycle/state'
import { readProductIntelligence }   from '@/lib/catalog/pricing-memory/state'
import { computeRecommendationScore, buildRecommendationReasons } from './engine'
import type { RecommendationStore, ProductRecommendation } from './types'

const RECOMMENDATIONS_FILE = path.resolve(process.cwd(), 'data/catalog/recommendations.json')

// ── Atomic write ──────────────────────────────────────────────────────────────

function atomicWrite(filePath: string, content: string): void {
  const tmp = filePath + '.tmp'
  storage.write(tmp, content)
  storage.rename(tmp, filePath)
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function defaultStore(): RecommendationStore {
  return { updatedAt: null, products: {} }
}

function defaultRecommendation(asin: string, now: string): ProductRecommendation {
  return {
    asin,
    category:            '',
    recommendationScore: 0,
    opportunityScore:    0,
    confidenceScore:     0,
    qualityScore:        0,
    trend:               'stable',
    reasons:             [],
    createdAt:           now,
  }
}

// ── Migration ─────────────────────────────────────────────────────────────────

function migrateStore(raw: unknown): RecommendationStore {
  if (!raw || typeof raw !== 'object') return defaultStore()
  const r = raw as Record<string, unknown>

  const products: Record<string, ProductRecommendation> = {}
  const rawProds = r['products']
  if (rawProds && typeof rawProds === 'object' && !Array.isArray(rawProds)) {
    for (const [asin, v] of Object.entries(rawProds as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const p = v as Record<string, unknown>

      const trend = p['trend']
      const validTrend = trend === 'rising' || trend === 'falling' || trend === 'stable'
        ? trend as ProductRecommendation['trend']
        : 'stable'

      products[asin] = {
        asin:                typeof p['asin']                === 'string'  ? p['asin']                : asin,
        category:            typeof p['category']            === 'string'  ? p['category']            : '',
        recommendationScore: typeof p['recommendationScore'] === 'number'  ? p['recommendationScore'] : 0,
        opportunityScore:    typeof p['opportunityScore']    === 'number'  ? p['opportunityScore']    : 0,
        confidenceScore:     typeof p['confidenceScore']     === 'number'  ? p['confidenceScore']     : 0,
        qualityScore:        typeof p['qualityScore']        === 'number'  ? p['qualityScore']        : 0,
        trend:               validTrend,
        reasons:             Array.isArray(p['reasons']) ? (p['reasons'] as unknown[]).filter((r): r is string => typeof r === 'string') : [],
        createdAt:           typeof p['createdAt']           === 'string'  ? p['createdAt']           : new Date().toISOString(),
      }
    }
  }

  return {
    updatedAt: typeof r['updatedAt'] === 'string' ? r['updatedAt'] : null,
    products,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function readRecommendations(): RecommendationStore {
  try {
    const raw = storage.read(RECOMMENDATIONS_FILE)
    if (raw === null) return defaultStore()
    return migrateStore(JSON.parse(raw))
  } catch {
    return defaultStore()
  }
}

export function saveRecommendations(store: RecommendationStore): void {
  try {
    atomicWrite(RECOMMENDATIONS_FILE, JSON.stringify(store, null, 2))
  } catch {
    // best-effort
  }
}

export function updateRecommendation(
  asin:    string,
  updates: Partial<Omit<ProductRecommendation, 'asin'>>,
): void {
  try {
    const store    = readRecommendations()
    const now      = new Date().toISOString()
    const existing = store.products[asin]
    const base     = defaultRecommendation(asin, now)
    store.products[asin] = { ...base, ...existing, ...updates, asin }
    store.updatedAt      = now
    saveRecommendations(store)
  } catch {
    // best-effort
  }
}

/**
 * Full rebuild of the recommendations store.
 *
 * Reads the runtime catalog, lifecycle store, and intelligence store.
 * Recomputes every recommendation score from scratch.
 * Single atomic write.
 *
 * Safe to call from any pipeline — never throws.
 *
 * @returns number of products processed.
 */
export function rebuildRecommendations(): number {
  try {
    const now          = new Date().toISOString()
    const runtimeProds = getRuntimeProducts()
    const lifecycle    = readLifecycleStore()
    const intelligence = readProductIntelligence()

    const products: Record<string, ProductRecommendation> = {}

    for (const product of runtimeProds) {
      const lc   = lifecycle.products[product.asin]
      const intel = intelligence.products[product.asin]

      const opportunityScore  = intel?.opportunityScore  ?? 0
      const confidenceScore   = lc?.confidenceScore      ?? (product.trustScore ?? product.validationScore ?? 0)
      const qualityScore      = lc?.qualityScore         ?? (product.validationScore ?? 0)
      const trend             = intel?.trend             ?? 'stable'
      const lifecycleHealth   = lc?.health               ?? 'stale'

      const recommendationScore = computeRecommendationScore({
        opportunityScore,
        confidenceScore,
        qualityScore,
        trend,
        lifecycleHealth,
      })

      const reasons = buildRecommendationReasons({
        opportunityScore,
        confidenceScore,
        qualityScore,
        trend,
        lifecycleHealth,
      })

      const existing = {} // fresh rebuild — no preserved state needed
      void existing

      products[product.asin] = {
        asin:     product.asin,
        category: product.category,
        recommendationScore,
        opportunityScore,
        confidenceScore,
        qualityScore,
        trend,
        reasons,
        createdAt: now,
      }
    }

    const store: RecommendationStore = { updatedAt: now, products }
    saveRecommendations(store)
    return runtimeProds.length
  } catch {
    return 0
  }
}
