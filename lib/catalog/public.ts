/**
 * lib/catalog/public.ts
 *
 * GOODPRICE public catalog — single source of truth for all user-facing product data.
 *
 * A product must pass ALL of the following gates to be visible publicly:
 *
 *   Gate 1 — Catalog status:     status !== 'inactive' (enforced by getColombiaProducts)
 *   Gate 2 — Colombia shipping:  no colombiaRestriction (enforced by getColombiaProducts)
 *   Gate 3 — Quarantine:         not in data/audit/quarantine.json
 *   Gate 4 — ASIN format:        matches /^[A-Z0-9]{10}$/ (catches typos / empty ASINs)
 *   Gate 5 — Image URL:          structurally valid URL (not empty / not clearly broken)
 *   Gate 5E — Image health:      image-health score ≥ suppress threshold (auto-hides dead ASINs)
 *   Gate 5V — Visual quality:    image-health score ≥ quality threshold (no placeholder-only cards)
 *   Gate 6 — Audit score:        score >= MIN_PUBLIC_SCORE in the latest audit (if available)
 *   Gate 7 — Consecutive fails:  did NOT fail the last 2 consecutive audits (auto-suppress)
 *   Gate 8 — Intelligence:       not in the CRITICAL suppression queue (snapshot-based)
 *   Gate 9 — Link health:        Amazon product page confirmed reachable (link-audit cache)
 *   Gate 10 — Colombia availability: product confirmed shippable to Colombia (colombia-audit cache)
 *   Gate 11 — Self-healing suppression: not in data/catalog/live-truth/suppressed.json
 *             (auto-suppressed by the self-healing system; recoverable when truth score improves)
 *
 * Broken CDN images (images-na.ssl-images-amazon.com/images/I/) are NOT an exclusion gate —
 * they receive category placeholder treatment in the UI (see lib/catalog/placeholders.ts).
 *
 * IMPORTANT: This module reads from the filesystem at module-init time (build / cold-start).
 * All reads are synchronous. This is intentional and consistent with how data/products.ts
 * and data/catalog/index.ts work. Changes to quarantine.json / audit reports take effect
 * on the next deployment or Vercel ISR cycle.
 *
 * Public API:
 *   getPublicProducts()                    → all publicly safe products
 *   getPublicProductByAsin(asin)           → single product or null
 *   getPublicCategoryProducts(category)   → products for a given category
 *   isPublicSafeProduct(product)          → boolean predicate
 *   getPublicCatalogStats()               → counts for admin / monitoring
 */

import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { getColombiaProducts, getAllProducts } from '@/data/catalog'
import { isValidAsinFormat } from './validator'
import { isKnownBrokenImageUrl } from './placeholders'
import { getCachedSnapshot } from '@/lib/catalog/intelligence/snapshot'
import { isLinkSuppressible } from './link-health'
import { isColombiaUnavailable } from './colombia-availability'
import { applyLiveTruthOverrides } from './live-truth/overrides'
import {
  isProductPublic,
  computeCatalogVisibility,
} from './trust'
import type { Product } from '@/types'

// ── Configuration ──────────────────────────────────────────────────────────────

/** Products scoring below this threshold in the latest audit are hidden. */
export const MIN_PUBLIC_SCORE = 70

// ── Quarantine loader ─────────────────────────────────────────────────────────

interface QuarantineEntry {
  productId: string
  asin:      string
  score?:    number
  issues?:   string[]
  quarantinedAt: string
}

interface QuarantineFile {
  entries: Record<string, QuarantineEntry>
}

function loadQuarantinedIds(): Set<string> {
  const ids = new Set<string>()
  const path = join(process.cwd(), 'data', 'audit', 'quarantine.json')
  if (!existsSync(path)) return ids
  try {
    const data: QuarantineFile = JSON.parse(readFileSync(path, 'utf8'))
    for (const id of Object.keys(data.entries ?? {})) {
      ids.add(id)
    }
  } catch { /* graceful — empty quarantine set rather than throw */ }
  return ids
}

// ── Audit score loader ────────────────────────────────────────────────────────

interface AuditProductEntry {
  productId:   string
  score:       number
  quarantined: boolean
}

interface AuditReport {
  products: AuditProductEntry[]
}

/**
 * Returns a Map<productId, score[]> of the last N audit reports (newest first).
 * Used to detect consecutive failures (Gate 7).
 */
function loadAuditHistory(maxReports = 2): Map<string, number[]> {
  const history = new Map<string, number[]>()
  const reportsDir = join(process.cwd(), 'data', 'audit', 'reports')
  if (!existsSync(reportsDir)) return history

  let files: string[] = []
  try {
    files = readdirSync(reportsDir)
      .filter(f => f.endsWith('.json'))
      .sort()                         // ascending → slice from end = newest last
      .slice(-maxReports)             // only last N reports
      .reverse()                      // newest first
  } catch { return history }

  for (const file of files) {
    try {
      const report: AuditReport = JSON.parse(
        readFileSync(join(reportsDir, file), 'utf8'),
      )
      for (const p of report.products ?? []) {
        const existing = history.get(p.productId) ?? []
        existing.push(p.score)
        history.set(p.productId, existing)
      }
    } catch { /* skip corrupt file */ }
  }

  return history
}

/**
 * Returns a Map<productId, score> from the most recent audit report.
 * Products not present are considered unaudited (no score constraint applied).
 */
function loadLatestAuditScores(): Map<string, number> {
  const scores = new Map<string, number>()
  const reportsDir = join(process.cwd(), 'data', 'audit', 'reports')
  if (!existsSync(reportsDir)) return scores

  let files: string[] = []
  try {
    files = readdirSync(reportsDir)
      .filter(f => f.endsWith('.json'))
      .sort()
  } catch { return scores }

  if (files.length === 0) return scores
  const latestFile = files[files.length - 1]

  try {
    const report: AuditReport = JSON.parse(
      readFileSync(join(reportsDir, latestFile), 'utf8'),
    )
    for (const p of report.products ?? []) {
      scores.set(p.productId, p.score)
    }
  } catch { /* graceful */ }

  return scores
}

// ── Module-level singletons (evaluated once per process / cold-start) ──────────

const _quarantinedIds  = loadQuarantinedIds()
const _latestScores    = loadLatestAuditScores()
const _auditHistory    = loadAuditHistory(2)

// ── Core predicate ─────────────────────────────────────────────────────────────

/**
 * Returns true if the product is safe to display publicly.
 *
 * Delegates to the trust engine (lib/catalog/trust) which applies a
 * multi-tier visibility system. Products are either SUPPRESSED (hidden)
 * or one of ACTIVE / WARNING / DEGRADED (all publicly visible).
 *
 * WARNING and DEGRADED products are visible but carry warning badges
 * (see lib/catalog/trust/warning-badges.ts) and may receive reduced
 * ranking. Only SUPPRESSED products are hidden.
 *
 * Gate rebalancing summary (vs. old binary gates):
 *   Gate 5V  — image CDN quality → WARNING/DEGRADED instead of SUPPRESSED
 *   Gate 9   — dead link: 1st detect → WARNING; 2+ confirms → SUPPRESSED
 *   Gate 10  — Colombia unavailable → DEGRADED (not SUPPRESSED)
 *   Gate 11  — healing suppression < 7d → DEGRADED; ≥ 7d → SUPPRESSED
 *
 * All other hard gates (1-5E, 7, 8) still result in SUPPRESSED.
 */
const MIN_RATING  = 4.0
const MIN_REVIEWS = 50

export function isPublicSafeProduct(product: Product): boolean {
  if (product.rating  < MIN_RATING)  return false
  if (product.reviews < MIN_REVIEWS) return false
  return isProductPublic(product)
}

// ── Public catalog functions ──────────────────────────────────────────────────

/**
 * All products safe for public display.
 * Equivalent to the old getColombiaProducts() but with additional safety gates.
 * This is the ONLY function public-facing pages should use.
 */
export function getPublicProducts(): Product[] {
  const filtered = getColombiaProducts().filter(isPublicSafeProduct)
  // Protection layer: log a server-side warning if the catalog is completely empty.
  // This is a configuration/deployment error (quarantine too aggressive, audit scores wrong, etc.)
  if (filtered.length === 0) {
    console.warn(
      '[GOODPRICE] WARN: getPublicProducts() returned 0 products. ' +
      'Check catalog status, quarantine.json, audit scores, and CATALOG_STRICT_MODE. ' +
      'All UI surfaces will show empty states.'
    )
  }
  // Apply self-healing metadata overrides (price / image corrections).
  // Fast-path: no-op when metadata-overrides.json has no entries.
  return applyLiveTruthOverrides(filtered)
}

/**
 * Find a single product by ASIN — returns null if not found or not publicly safe.
 * Use in /productos/[asin] pages instead of getColombiaProducts().find(...)
 */
export function getPublicProductByAsin(asin: string): Product | null {
  if (!asin || !isValidAsinFormat(asin)) return null
  const product = getColombiaProducts().find(p => p.asin === asin)
  if (!product) return null
  if (!isPublicSafeProduct(product)) return null
  return product
}

/**
 * All public products for a given category slug, sorted by intelligence ranking
 * when a snapshot is available. Falls back to original catalog order otherwise.
 */
export function getPublicCategoryProducts(category: string): Product[] {
  const base     = getPublicProducts().filter(p => p.category === category)
  const snapshot = getCachedSnapshot()

  if (!snapshot) return base

  const ranked = snapshot.categoryRankings[category]
  if (!ranked || ranked.length === 0) return base

  // Sort products by their position in the intelligence-ranked array.
  // Products not present in the ranked list go last (shouldn't happen, but safe).
  const positionMap = new Map(ranked.map((id, idx) => [id, idx]))
  return [...base].sort((a, b) => {
    const posA = positionMap.get(a.id ?? '') ?? ranked.length
    const posB = positionMap.get(b.id ?? '') ?? ranked.length
    return posA - posB
  })
}

// ── Catalog reliability stats (for admin + monitoring) ────────────────────────

export interface PublicCatalogStats {
  /** Total raw products in all catalog files (including inactive) */
  total:              number
  /** Products visible on the public site right now (active + warning + degraded) */
  public:             number
  /** Products hidden (not visible) — SUPPRESSED tier only */
  hidden:             number
  /** Products in the quarantine list */
  quarantined:        number
  /** Products with score < MIN_PUBLIC_SCORE in latest audit */
  lowScore:           number
  /** Products with known-broken or invalid image URLs (deprecated CDN) */
  brokenImages:       number
  /** Products suppressed due to 2+ consecutive critical audit failures */
  autoSuppressed:     number
  /** Products excluded by Colombia shipping rules (pre-gate static restriction) */
  colombiaBlocked:    number
  /** Products with Gate 9 dead-link signal (suppressed or warning) */
  deadLinks:          number
  /** Products with Gate 10 Colombia unavailable signal (degraded tier) */
  colombiaUnavailable: number
  // ── Trust tier breakdown ──────────────────────────────────────────────────
  /** Products in ACTIVE tier (no issues) */
  tierActive:         number
  /** Products in WARNING tier (minor issues, still visible) */
  tierWarning:        number
  /** Products in DEGRADED tier (significant issues, visible with reduced priority) */
  tierDegraded:       number
  /** Products in SUPPRESSED tier (hidden from public) */
  tierSuppressed:     number
}

export function getPublicCatalogStats(): PublicCatalogStats {
  const all       = getAllProducts()
  const colombia  = getColombiaProducts()
  const pub       = getPublicProducts()

  // Count products with known-broken image URLs (deprecated images-na CDN)
  const brokenImages = all.filter(p => isKnownBrokenImageUrl(p.image)).length

  // Auto-suppressed: failed last 2 consecutive audits at critical level
  let autoSuppressed = 0
  for (const [, history] of Array.from(_auditHistory.entries())) {
    if (history.length >= 2 && history.every(s => s < MIN_PUBLIC_SCORE)) {
      autoSuppressed++
    }
  }

  // Dead links: Gate 9 signal (dead status, regardless of tier)
  const deadLinks = colombia.filter(p => isLinkSuppressible(p.id)).length

  // Colombia unavailable: products with Gate 10 signal (now DEGRADED instead of SUPPRESSED)
  const colombiaUnavailable = colombia.filter(p => isColombiaUnavailable(p.id)).length

  // Trust tier breakdown — compute visibility for all Colombia-eligible products
  const visibilityResults = computeCatalogVisibility(colombia)
  let tierActive = 0, tierWarning = 0, tierDegraded = 0, tierSuppressed = 0
  for (const r of visibilityResults) {
    switch (r.tier) {
      case 'active':    tierActive++;    break
      case 'warning':   tierWarning++;   break
      case 'degraded':  tierDegraded++;  break
      case 'suppressed': tierSuppressed++; break
    }
  }

  return {
    total:               all.length,
    public:              pub.length,
    hidden:              all.length - pub.length,
    quarantined:         _quarantinedIds.size,
    lowScore:            Array.from(_latestScores.values()).filter(s => s < MIN_PUBLIC_SCORE).length,
    brokenImages,
    autoSuppressed,
    colombiaBlocked:     all.length - colombia.length,
    deadLinks,
    colombiaUnavailable,
    tierActive,
    tierWarning,
    tierDegraded,
    tierSuppressed,
  }
}

/**
 * Returns the set of quarantined product IDs (read-only).
 * Used by admin dashboard to show quarantine details.
 */
export function getQuarantinedProductIds(): ReadonlySet<string> {
  return _quarantinedIds
}

/**
 * Returns the latest audit score for a product ID, or undefined if not audited.
 */
export function getProductAuditScore(productId: string): number | undefined {
  return _latestScores.get(productId)
}
