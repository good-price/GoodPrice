/**
 * lib/catalog/discovery/search.ts
 *
 * Catalog Pipeline — Search phase (Sprint 3F / 3G).
 *
 * Produces CatalogCandidate[] from existing catalog data — no new scraping.
 *
 * Two sources, both targeted to the requested category:
 *   1. Non-active products already in the target category (runtime catalog)
 *      — stale, inactive, or unverified products eligible for reactivation.
 *   2. Best-Sellers discovery candidates for the target category
 *      (data/catalog/discovery-candidates.json) — pre-scraped products that
 *      haven't been admitted yet. Primary source for real auto-fill.
 *
 * Candidates are deduplicated by ASIN within a single call.
 * Never throws.
 *
 * SERVER-ONLY.
 */

import { getRuntimeProducts } from '@/lib/catalog/runtime/reader'
import type { RuntimeProduct } from '@/lib/catalog/runtime/types'
import { loadCandidates }     from './candidate-store'
import type { DiscoveryCandidate } from './types'
import type { CatalogCandidate, CatalogCandidateSource, DiscoveryContext } from './types'

// ── Converters ────────────────────────────────────────────────────────────────

function sourceOf(p: RuntimeProduct): CatalogCandidateSource {
  if (p.source === 'manual') return 'manual'
  if (p.source === 'repair') return 'paapi'
  return 'amazon-page'
}

function runtimeToCandidate(p: RuntimeProduct, src: CatalogCandidateSource): CatalogCandidate {
  return {
    asin:                     p.asin,
    title:                    p.title,
    image:                    p.image || null,
    brand:                    p.brand,
    category:                 p.category,
    price:                    p.price,
    rating:                   p.rating,
    reviews:                  p.reviews,
    shipsToColombiaConfirmed: p.shipsToColombiaConfirmed,
    source:                   src,
    discoveryScore:           0,
    validationScore:          0,
    reasons:                  [],
  }
}

function discoveryToCandidate(dc: DiscoveryCandidate): CatalogCandidate {
  return {
    asin:                     dc.asin,
    title:                    dc.tileTitle ?? '',
    image:                    dc.imageUrl,
    brand:                    dc.brand ?? '',  // Sprint 4B: enriched from title when available
    category:                 dc.category,
    price:                    dc.tilePrice  ?? 0,
    rating:                   dc.rating     ?? 0,
    reviews:                  dc.reviewCount ?? 0,
    shipsToColombiaConfirmed: false, // not verified; builder sets to true on admission
    source:                   'amazon-page',
    discoveryScore:           0,
    validationScore:          0,
    reasons:                  [],
    // Sprint 4C: pass intelligence fields through to the admission pipeline
    firstDiscoveredAt:        dc.firstDiscoveredAt,
    lastDiscoveredAt:         dc.lastDiscoveredAt,
    timesDiscovered:          dc.timesDiscovered,
    timesValidated:           dc.timesValidated,
    timesRejected:            dc.timesRejected,
    timesAdmitted:            dc.timesAdmitted,
    qualityScore:             dc.qualityScore,
    confidenceScore:          dc.confidenceScore,
    lastDiscoveryPipelineId:  dc.lastDiscoveryPipelineId,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Searches for catalog candidates using existing data.
 *
 * No network calls. No new scraping. Synchronous.
 * Candidates are ephemeral — NOT persisted.
 * Never throws.
 */
export function searchCatalogCandidates(context: DiscoveryContext): CatalogCandidate[] {
  try {
    const seen = new Set<string>()
    const candidates: CatalogCandidate[] = []

    // Source 1: non-active products already in the target category (runtime catalog)
    for (const p of getRuntimeProducts()) {
      if (p.category === context.category && p.status !== 'active' && !seen.has(p.asin)) {
        seen.add(p.asin)
        candidates.push(runtimeToCandidate(p, sourceOf(p)))
      }
    }

    // Source 2: Best-Sellers discovery candidates for the target category
    const store = loadCandidates()
    for (const dc of store.items) {
      if (dc.category === context.category && !seen.has(dc.asin)) {
        seen.add(dc.asin)
        candidates.push(discoveryToCandidate(dc))
      }
    }

    return candidates
  } catch {
    return []
  }
}
