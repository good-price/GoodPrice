/**
 * lib/catalog/discovery/enrichment.ts
 *
 * Candidate enrichment pipeline — Sprint 4B.
 *
 * Completes metadata missing after HTML parsing:
 *   - brand:  extracted from the product title (first capitalized word)
 *   - title:  HTML-decoded and whitespace-normalized
 *   - image:  Amazon CDN URL normalized (resize params stripped)
 *   - price:  falls back to the existing candidate store if 0
 *
 * Uses only data already available locally — no additional network requests.
 * Falls back to the candidate pool (CandidateStore) for missing fields when
 * the same ASIN already exists with better metadata from a previous run.
 *
 * SERVER-ONLY.
 */

import type { ParsedProduct } from './amazon/types'
import type { CandidateStore } from './types'

// ── Brand extraction ──────────────────────────────────────────────────────────

const NON_BRANDS = new Set([
  'The', 'A', 'An', 'New', 'Best', 'Top', 'Buy', 'For', 'With', 'Set',
  'Pack', 'Lot', 'Kit', 'Case', 'Box', 'Bag', 'Premium', 'Ultimate', 'Super',
  'Mini', 'Large', 'Small', 'Big', 'Wireless', 'Digital', 'Electric',
])

function extractBrand(title: string): string {
  if (!title || title.trim().length === 0) return ''
  const words = title.trim().split(/[\s,|–\-]+/)
  for (const word of words.slice(0, 3)) {
    const clean = word.replace(/[^A-Za-z0-9]/g, '')
    if (clean.length >= 2 && /^[A-Z]/.test(word) && !NON_BRANDS.has(word)) {
      return clean
    }
  }
  return ''
}

// ── Title cleaning ────────────────────────────────────────────────────────────

function cleanTitle(title: string): string {
  return title
    .replace(/&amp;/g,      '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g,     '"')
    .replace(/&lt;/g,       '<')
    .replace(/&gt;/g,       '>')
    .replace(/&nbsp;/g,     ' ')
    .replace(/\s+/g,        ' ')
    .trim()
}

// ── Image URL normalization ───────────────────────────────────────────────────

function normalizeImage(url: string | null): string | null {
  if (!url) return null
  // Strip Amazon CDN resize parameters:  ._AC_SL1500_.  →  .
  return url
    .replace(/\._[A-Z0-9_,]+_\./i, '.')
    .replace(/\?.*$/, '')
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enriches a single ParsedProduct with:
 *   - Cleaned, decoded title
 *   - Normalized image URL
 *   - Brand extracted from title
 *   - Pool fallback for missing title / image / price
 *
 * Never throws. Returns the original product (possibly enriched) on any error.
 */
export function enrichCandidate(
  product: ParsedProduct,
  pool?: CandidateStore,
): ParsedProduct {
  try {
    const existing = pool?.items.find(i => i.asin === product.asin)

    const title = cleanTitle(product.title) || (existing?.tileTitle ?? '')
    const image = normalizeImage(product.image) ?? (existing?.imageUrl ?? null)
    const brand = extractBrand(title) || undefined
    const price = product.price > 0 ? product.price : (existing?.tilePrice ?? 0)

    return { ...product, title, image, brand, price }
  } catch {
    return product
  }
}

/**
 * Enriches a batch of ParsedProducts. Pool is loaded once and shared.
 * Never throws.
 */
export function enrichCandidates(
  products: ParsedProduct[],
  pool?: CandidateStore,
): ParsedProduct[] {
  return products.map(p => enrichCandidate(p, pool))
}
