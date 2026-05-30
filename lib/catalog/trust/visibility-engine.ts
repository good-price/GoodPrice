/**
 * lib/catalog/trust/visibility-engine.ts
 *
 * Main public API for the GOODPRICE product visibility system.
 *
 * Replaces the binary isPublicSafeProduct() predicate with a multi-tier
 * visibility system. Products no longer pass/fail — they receive a tier:
 *   active / warning / degraded / suppressed
 *
 * Context loading:
 *   All gate data (quarantine, audit scores, intelligence snapshot,
 *   healing suppression state) is loaded once at module-init time
 *   and cached for the process lifetime. The intelligence snapshot
 *   uses the same lazy-refresh pattern as lib/catalog/public.ts.
 *
 * Public API:
 *   computeProductVisibility(product)     → VisibilityResult for one product
 *   computeCatalogVisibility(products)    → VisibilityResult[] for all products
 *   buildVisibilityContext()              → shared context (exported for reports)
 *   isProductPublic(product)              → boolean (fast path for gate check)
 *   getProductTier(product)               → VisibilityTier (fast path)
 *
 * SERVER-ONLY.
 */

import { existsSync, readFileSync, readdirSync }   from 'fs'
import { join }                                     from 'path'
import { getCachedSnapshot }                        from '@/lib/catalog/intelligence/snapshot'
import { loadSuppressedStore }                      from '@/lib/catalog/live-truth/suppression'
import { getFailures }                              from '@/lib/catalog/repair/history'
import type { Product }                             from '@/types'
import type { VisibilityContext, VisibilityResult, VisibilityTier } from './types'
import { computeProductTier }                       from './trust-engine'

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_PUBLIC_SCORE   = 70   // mirrors public.ts
const CRITICAL_SCORE     = 40

// ── Context loaders (loaded once at cold-start) ───────────────────────────────

function loadQuarantinedIds(): Set<string> {
  const ids  = new Set<string>()
  const path = join(process.cwd(), 'data', 'audit', 'quarantine.json')
  if (!existsSync(path)) return ids
  try {
    const data: { entries?: Record<string, unknown> } =
      JSON.parse(readFileSync(path, 'utf8'))
    for (const id of Object.keys(data.entries ?? {})) ids.add(id)
  } catch { /* graceful */ }
  return ids
}

function loadAuditReports(maxReports = 2): {
  scores:  Map<string, number>
  history: Map<string, number[]>
} {
  const scores  = new Map<string, number>()
  const history = new Map<string, number[]>()
  const dir     = join(process.cwd(), 'data', 'audit', 'reports')

  if (!existsSync(dir)) return { scores, history }

  let files: string[] = []
  try {
    files = readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .slice(-maxReports)
      .reverse()  // newest first
  } catch { return { scores, history } }

  for (let i = 0; i < files.length; i++) {
    try {
      const report: { products?: { productId: string; score: number }[] } =
        JSON.parse(readFileSync(join(dir, files[i]), 'utf8'))
      for (const p of report.products ?? []) {
        if (i === 0) scores.set(p.productId, p.score)   // latest report
        const existing = history.get(p.productId) ?? []
        existing.push(p.score)
        history.set(p.productId, existing)
      }
    } catch { /* skip corrupt file */ }
  }

  return { scores, history }
}

function loadFailureCounts(): Map<string, number> {
  const counts = new Map<string, number>()
  try {
    for (const f of getFailures()) {
      counts.set(f.productId, (counts.get(f.productId) ?? 0) + 1)
    }
  } catch { /* no history file — fine */ }
  return counts
}

// ── Intelligence snapshot cache ───────────────────────────────────────────────

let _intelligenceSet:       Set<string> | null = null
let _intelligenceSnapshotAt: string | null     = null

function getIntelligenceSuppressedIds(): Set<string> {
  const snapshot = getCachedSnapshot()
  if (!snapshot) {
    _intelligenceSet       = null
    _intelligenceSnapshotAt = null
    return new Set()
  }
  if (_intelligenceSnapshotAt !== snapshot.generatedAt) {
    _intelligenceSet        = new Set(snapshot.suppressedIds)
    _intelligenceSnapshotAt = snapshot.generatedAt
  }
  return _intelligenceSet ?? new Set()
}

// ── Module-level context (lazy-initialized once) ──────────────────────────────

let _ctx: VisibilityContext | null = null

export function buildVisibilityContext(): VisibilityContext {
  if (_ctx) {
    // Refresh intelligence suppressed set (can change between renders)
    _ctx.intelligenceSuppressedIds = getIntelligenceSuppressedIds()
    return _ctx
  }

  const { scores, history } = loadAuditReports(2)
  const healingStore        = loadSuppressedStore()

  const healingEntries = new Map(
    Object.values(healingStore.entries).map(e => [
      e.productId,
      { suppressedAt: e.suppressedAt, reason: e.reason, truthScore: e.truthScore },
    ]),
  )

  _ctx = {
    quarantinedIds:           loadQuarantinedIds(),
    latestAuditScores:        scores,
    auditHistory:             history,
    failureCounts:            loadFailureCounts(),
    intelligenceSuppressedIds: getIntelligenceSuppressedIds(),
    healingEntries,
  }

  return _ctx
}

/**
 * Force-invalidates the context cache.
 * Call after any write to quarantine.json, audit reports, or healing store.
 */
export function invalidateVisibilityContext(): void {
  _ctx = null
  _intelligenceSet        = null
  _intelligenceSnapshotAt = null
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute the full visibility result for a single product.
 * Applies any active manual operator override AFTER trust computation.
 */
export function computeProductVisibility(product: Product): VisibilityResult {
  const context  = buildVisibilityContext()
  const result   = computeProductTier(product, context)
  // Lazy import to avoid circular dependency — override-engine imports from trust types only
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getOverride, applyOverrideToResult } = require('@/lib/ops/actions/override-engine') as {
      getOverride: (id: string) => { tier: string; operator: string; reason: string } | null
      applyOverrideToResult: (r: VisibilityResult, o: object) => VisibilityResult
    }
    const override = product.id ? getOverride(product.id) : null
    if (override) return applyOverrideToResult(result, override)
  } catch { /* override engine not yet initialised — fine */ }
  return result
}

/**
 * Compute visibility for an array of products (shared context, one cold-start load).
 * Applies active manual overrides efficiently (one disk read for all products).
 */
export function computeCatalogVisibility(products: Product[]): VisibilityResult[] {
  const context = buildVisibilityContext()
  const results = products.map(p => computeProductTier(p, context))

  // Apply overrides in bulk — one disk read
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadAllOverrides, applyOverrideToResult } = require('@/lib/ops/actions/override-engine') as {
      loadAllOverrides: () => Map<string, object>
      applyOverrideToResult: (r: VisibilityResult, o: object) => VisibilityResult
    }
    const overrides = loadAllOverrides()
    if (overrides.size > 0) {
      return results.map((r, i) => {
        const override = products[i]?.id ? overrides.get(products[i].id!) : undefined
        return override ? applyOverrideToResult(r, override) : r
      })
    }
  } catch { /* override engine not yet initialised — fine */ }

  return results
}

/**
 * Boolean gate predicate — returns true when product is publicly visible.
 * Drop-in replacement for isPublicSafeProduct() in public.ts.
 */
export function isProductPublic(product: Product): boolean {
  return computeProductVisibility(product).isPublic
}

/**
 * Returns just the visibility tier for a product.
 */
export function getProductTier(product: Product): VisibilityTier {
  return computeProductVisibility(product).tier
}

// ── Re-export threshold constants (used by public.ts) ─────────────────────────

export { MIN_PUBLIC_SCORE, CRITICAL_SCORE }
