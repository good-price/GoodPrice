/**
 * lib/catalog/discovery/run-discovery.ts
 *
 * Orchestrates a full discovery run:
 *   1. Fetch Best Sellers page for each configured category
 *   2. Apply pre-filter (rating ≥ 4.4, reviews ≥ 5 000, price $20–$300)
 *   3. Deduplicate by ASIN (first-occurrence category wins)
 *   4. Persist to discovery-candidates.json
 *   5. Return summary + per-category report
 *
 * Does NOT run validateCandidate() — that remains a separate step.
 * Discovered candidates are ready to be fed to the Candidate Validator.
 */

import { fetchBestSellersPage, BEST_SELLERS_CATEGORIES } from './best-sellers-scraper'
import { saveCandidates }                                 from './candidate-store'
import type { BestSellerTile, DiscoveryCandidate, CategoryReport, DiscoveryRunResult } from './types'

// ── Pre-filter thresholds ──────────────────────────────────────────────────────

const MIN_RATING   = 4.4
const MIN_REVIEWS  = 5_000
const MIN_PRICE    = 20
const MAX_PRICE    = 300

function passesPreFilter(tile: BestSellerTile): boolean {
  if (tile.rating      === null || tile.rating      < MIN_RATING)  return false
  if (tile.reviewCount === null || tile.reviewCount < MIN_REVIEWS)  return false
  if (tile.tilePrice   === null || tile.tilePrice   < MIN_PRICE)   return false
  if (tile.tilePrice   > MAX_PRICE)                                 return false
  return true
}

// ── Delay between category fetches ────────────────────────────────────────────

const INTER_CATEGORY_DELAY_MS = 3_000

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runDiscovery(): Promise<DiscoveryRunResult> {
  const runAt      = new Date().toISOString()
  const allPassed: DiscoveryCandidate[] = []
  const reports:   CategoryReport[]     = []

  for (let i = 0; i < BEST_SELLERS_CATEGORIES.length; i++) {
    const { category, url } = BEST_SELLERS_CATEGORIES[i]

    if (i > 0) await sleep(INTER_CATEGORY_DELAY_MS)

    const page   = await fetchBestSellersPage(category, url)
    const passed = page.tiles.filter(passesPreFilter)

    const candidates: DiscoveryCandidate[] = passed.map(t => ({
      ...t,
      discoveredAt: runAt,
      source:       'best-sellers' as const,
    }))

    allPassed.push(...candidates)

    reports.push({
      category,
      extracted: page.extracted,
      filtered:  page.extracted - passed.length,
      passed:    passed.length,
    })
  }

  // Deduplicate by ASIN across categories — first occurrence wins
  const seen    = new Set<string>()
  const deduped = allPassed.filter(c => {
    if (seen.has(c.asin)) return false
    seen.add(c.asin)
    return true
  })

  saveCandidates(deduped)

  const totalExtracted = reports.reduce((s, r) => s + r.extracted, 0)
  const totalFiltered  = reports.reduce((s, r) => s + r.filtered,  0)

  return {
    discovered: totalExtracted,
    filtered:   totalFiltered,
    candidates: deduped.length,
    byCategory: reports,
    runAt,
  }
}
