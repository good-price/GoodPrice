/**
 * MercadoLibre Search — Best-Match Selection
 *
 * Given a list of ML search results for a GOODPRICE catalog product,
 * scores and ranks them to select the most likely correct match.
 *
 * Scoring dimensions (100 pts total):
 *   Title similarity  — 40 pts   text overlap between query and result title
 *   Price sanity      — 20 pts   price within expected range for Colombia
 *   Listing quality   — 20 pts   gold listings preferred, free shipping bonus
 *   Availability      — 20 pts   active, in-stock listings preferred
 *
 * The algorithm is intentionally conservative: if no candidate scores ≥ MIN_SCORE,
 * the function returns null rather than guessing wrong.
 *
 * All functions are pure (no I/O).
 */

import type { MLSearchItem } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum score (0–100) to consider a result a confident match */
const MIN_CONFIDENCE_SCORE = 45

/** Listing types in decreasing quality order */
const LISTING_TYPE_SCORES: Record<string, number> = {
  gold_pro:     20,
  gold_special: 17,
  gold:         14,
  silver:        8,
  bronze:        4,
  free:          2,
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoredMLResult {
  item:  MLSearchItem
  score: number
  breakdown: {
    titleScore:        number
    priceScore:        number
    listingScore:      number
    availabilityScore: number
  }
  /** Human-readable reason for match or rejection */
  verdict: string
}

export interface MLSearchMatch {
  /** Best-matching ML item */
  item:   MLSearchItem
  /** Overall confidence score 0–100 */
  score:  number
  /** Whether we have enough confidence to auto-use this match */
  isConfident: boolean
  /** All scored candidates, sorted by score desc */
  candidates: ScoredMLResult[]
}

// ── Title similarity ──────────────────────────────────────────────────────────

/**
 * Normalize text for comparison: lowercase, no punctuation, no stop words.
 */
function normalizeText(text: string): string[] {
  const stopWords = new Set([
    'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'con', 'en', 'para',
    'por', 'y', 'o', 'a', 'al', 'se', 'no', 'que', 'es', 'the', 'a', 'an',
    'and', 'or', 'for', 'of', 'in', 'with', 'to', 'from',
    'generacion', 'generación', 'generation', 'gen', 'edicion', 'edición',
  ])

  return text
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w))
}

/**
 * Jaccard similarity between two term sets.
 * Returns 0.0–1.0 (1.0 = identical term sets).
 */
function jaccardSimilarity(setA: string[], setB: string[]): number {
  if (setA.length === 0 && setB.length === 0) return 1
  if (setA.length === 0 || setB.length === 0) return 0

  const a = new Set(setA)
  const b = new Set(setB)

  const intersection = setA.filter(t => b.has(t)).length
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Score how well an ML item title matches the search query.
 *
 * Uses Jaccard similarity on normalized term sets.
 * Returns 0–40 points.
 *
 * @param queryTerms   - Normalized terms from the search query
 * @param itemTitle    - ML item title
 */
export function scoreTitleMatch(queryTerms: string[], itemTitle: string): number {
  const titleTerms = normalizeText(itemTitle)
  const similarity = jaccardSimilarity(queryTerms, titleTerms)

  // Apply a slight boost if all query terms appear in the title
  const allTermsCovered = queryTerms.every(t => titleTerms.includes(t))
  const boost = allTermsCovered ? 0.1 : 0

  return Math.round(Math.min(1, similarity + boost) * 40)
}

// ── Price sanity ──────────────────────────────────────────────────────────────

/**
 * Score price sanity for an ML item against an expected USD price.
 *
 * Colombia pricing rule of thumb for tech products:
 *   Local price = Amazon price × 1.3 to 1.8 (import markup + duties + margin)
 *
 * We accept anything in the range [0.5×, 3.0×] of the Amazon USD price
 * converted to COP, and reward tighter bounds.
 *
 * Returns 0–20 points.
 *
 * @param mlPriceCOP    - ML item price in COP
 * @param expectedUSD   - Expected USD price (Amazon reference)
 * @param copPerUSD     - Current COP/USD rate
 */
export function scorePriceSanity(
  mlPriceCOP: number,
  expectedUSD: number,
  copPerUSD: number,
): number {
  if (expectedUSD <= 0 || copPerUSD <= 0) return 10 // neutral

  const expectedCOP = expectedUSD * copPerUSD
  const ratio = mlPriceCOP / expectedCOP

  // Perfect zone: 1.0× – 1.8× (local markup expected)
  if (ratio >= 1.0 && ratio <= 1.8) return 20
  // Acceptable: 0.8× – 2.5× (sale or slightly high)
  if (ratio >= 0.8 && ratio <= 2.5) return 14
  // Stretch: 0.5× – 3.0× (suspicious but possible)
  if (ratio >= 0.5 && ratio <= 3.0) return 7
  // Out of range — likely wrong product
  return 0
}

// ── Listing quality ───────────────────────────────────────────────────────────

/**
 * Score the quality/reliability of an ML listing.
 * Returns 0–20 points.
 *
 * @param item - ML search result item
 */
export function scoreListingQuality(item: MLSearchItem): number {
  const typeScore = LISTING_TYPE_SCORES[item.listing_type_id] ?? 4
  const freeShipping = item.shipping.free_shipping ? 3 : 0
  const hasSales = item.sold_quantity > 10 ? 2 : item.sold_quantity > 0 ? 1 : 0
  const condition = item.condition === 'new' ? 1 : 0

  return Math.min(20, typeScore + freeShipping + hasSales + condition)
}

// ── Availability ──────────────────────────────────────────────────────────────

/**
 * Score availability of an ML item.
 * Returns 0–20 points.
 *
 * @param item - ML search result item
 */
export function scoreAvailability(item: MLSearchItem): number {
  if (item.available_quantity > 10) return 20
  if (item.available_quantity > 5)  return 16
  if (item.available_quantity > 0)  return 12
  return 0
}

// ── Main ranking function ─────────────────────────────────────────────────────

/**
 * Score and rank ML search results for a given catalog product.
 *
 * @param results     - ML search results (up to 50)
 * @param query       - Search query used (for title matching)
 * @param expectedUSD - Catalog Amazon price in USD
 * @param copPerUSD   - Current COP/USD exchange rate
 * @returns Sorted array of scored results (best first)
 */
export function rankMLResults(
  results: MLSearchItem[],
  query: string,
  expectedUSD: number,
  copPerUSD: number,
): ScoredMLResult[] {
  const queryTerms = normalizeText(query)

  return results
    .map(item => {
      const titleScore        = scoreTitleMatch(queryTerms, item.title)
      const priceScore        = scorePriceSanity(item.price, expectedUSD, copPerUSD)
      const listingScore      = scoreListingQuality(item)
      const availabilityScore = scoreAvailability(item)

      const score = titleScore + priceScore + listingScore + availabilityScore

      let verdict = ''
      if (score >= 80)      verdict = 'Muy alta coincidencia'
      else if (score >= 60) verdict = 'Alta coincidencia'
      else if (score >= 45) verdict = 'Coincidencia moderada'
      else if (score >= 25) verdict = 'Coincidencia baja'
      else                  verdict = 'Sin coincidencia'

      return {
        item,
        score,
        breakdown: { titleScore, priceScore, listingScore, availabilityScore },
        verdict,
      }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * Find the best ML listing match for a catalog product.
 *
 * @param results     - ML search results
 * @param query       - Search query (used for title scoring)
 * @param expectedUSD - Expected price in USD (from catalog)
 * @param copPerUSD   - Current COP/USD rate
 * @returns Best match with confidence flag, or null if no good match found
 */
export function findBestMatch(
  results: MLSearchItem[],
  query: string,
  expectedUSD: number,
  copPerUSD: number,
): MLSearchMatch | null {
  if (results.length === 0) return null

  const candidates = rankMLResults(results, query, expectedUSD, copPerUSD)
  const best = candidates[0]

  return {
    item:        best.item,
    score:       best.score,
    isConfident: best.score >= MIN_CONFIDENCE_SCORE,
    candidates,
  }
}

/**
 * Filter ML results to only new-condition, active, in-stock items.
 * Use before ranking to reduce noise in search results.
 *
 * @param results   - Raw ML search results
 * @param minStock  - Minimum available_quantity to include (default: 1)
 */
export function filterActiveResults(
  results: MLSearchItem[],
  minStock = 1,
): MLSearchItem[] {
  return results.filter(item =>
    item.condition === 'new' &&
    item.available_quantity >= minStock,
  )
}
