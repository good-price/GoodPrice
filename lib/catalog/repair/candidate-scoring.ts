/**
 * lib/catalog/repair/candidate-scoring.ts
 *
 * Scores RepairCandidates against the original product.
 *
 * Score breakdown (0–100 total):
 *   imageScore    0–25  valid + verified URL responds 200
 *   titleScore    0–25  Jaccard word-overlap similarity
 *   priceScore    0–20  within ±40 % of original price
 *   reviewScore   0–15  availability / review-count proxy
 *   categoryScore 0–15  brand/category keyword match
 *
 * For cdn_swap candidates the scoring is deterministic and skips
 * the ML-only fields (reviews, MercadoLibre permalink).
 *
 * Usage:
 *   const scored = await scoreCandidate(candidate, product)
 *   // candidate.confidence and candidate.scoreBreakdown are mutated in place
 */

import type { RepairCandidate } from './types'
import type { Product } from '@/types'
import { verifyImageUrl } from './candidate-search'

// ── Title similarity ───────────────────────────────────────────────────────────

/**
 * Tokenises a string into lowercase words ≥ 3 chars, ignoring punctuation.
 */
function tokenise(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3)
  return new Set(words)
}

/**
 * Jaccard similarity between two token sets: |A∩B| / |A∪B|
 * Returns 0–1.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenise(a)
  const setB = tokenise(b)

  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0

  const aArr = Array.from(setA)
  const intersection = aArr.filter(w => setB.has(w)).length
  const union = setA.size + setB.size - intersection
  return intersection / union
}

// ── Individual score components ────────────────────────────────────────────────

/**
 * Image score (0–25).
 * 0 if no image URL.
 * 5 if URL looks valid but was not verified (e.g. ML thumbnail not checked yet).
 * 15 if URL looks valid.
 * 25 if URL verified via HEAD request and returns 200.
 */
export function computeImageScore(
  candidate: RepairCandidate,
): number {
  if (!candidate.imageUrl) return 0
  if (candidate.imageVerified === true) return 25
  if (candidate.imageVerified === false) return 0
  // Not yet verified — give partial credit
  return 10
}

/**
 * Title score (0–25).
 * Jaccard similarity scaled to 25 pts.
 * CDN swap candidates always score 25 (same product).
 */
export function computeTitleScore(
  candidate: RepairCandidate,
  originalTitle: string,
): number {
  if (candidate.source === 'cdn_swap') return 25
  if (!candidate.title) return 0
  const sim = jaccardSimilarity(candidate.title, originalTitle)
  return Math.round(sim * 25)
}

/**
 * Price score (0–20).
 * CDN swap candidates always score 20 (same product, same price).
 * For ML candidates:
 *   20 pts if within ±10 %
 *   15 pts if within ±20 %
 *   10 pts if within ±30 %
 *    5 pts if within ±40 %
 *    0 pts if > 40 % off
 *    0 pts if either price is missing/zero
 */
export function computePriceScore(
  candidate: RepairCandidate,
  originalPrice: number,
): number {
  if (candidate.source === 'cdn_swap') return 20

  const candidatePrice = candidate.price
  if (!candidatePrice || candidatePrice <= 0) return 0
  if (!originalPrice || originalPrice <= 0) return 10 // no reference price — partial credit

  const ratio = Math.abs(candidatePrice - originalPrice) / originalPrice
  if (ratio <= 0.10) return 20
  if (ratio <= 0.20) return 15
  if (ratio <= 0.30) return 10
  if (ratio <= 0.40) return 5
  return 0
}

/**
 * Review/availability score (0–15).
 * CDN swap candidates always score 15 (same product).
 * ML candidates:
 *   +5 pts  product is "new" condition
 *   +5 pts  has a price (proxy for being in stock)
 *   +5 pts  has free shipping
 * Note: ML search API returns availability via "available_quantity" but we
 * don't receive that in the RepairCandidate. We use available fields instead.
 */
export function computeReviewScore(
  candidate: RepairCandidate,
): number {
  if (candidate.source === 'cdn_swap') return 15

  // For ML candidates we only have what mlProductToCandidate() passed through:
  // price (proxy for in-stock), no explicit review count yet.
  let score = 0
  if (candidate.price && candidate.price > 0) score += 10 // has price → likely available
  if (candidate.mlItemId) score += 5                       // confirmed ML product

  return Math.min(score, 15)
}

/**
 * Category score (0–15).
 * CDN swap candidates always score 15 (exact same product, same category).
 * For ML candidates we look for brand / category keyword overlap in notes.
 * Without a category taxonomy mapping (ML ↔ GOODPRICE) we cap at 10 pts max.
 */
export function computeCategoryScore(
  candidate: RepairCandidate,
  product: Product,
): number {
  if (candidate.source === 'cdn_swap') return 15

  // Check if brand appears in candidate title
  if (product.brand && candidate.title) {
    const brandLower = product.brand.toLowerCase()
    if (candidate.title.toLowerCase().includes(brandLower)) return 12
  }

  // Check notes contain brand info
  if (product.brand && candidate.notes) {
    const brandLower = product.brand.toLowerCase()
    if (candidate.notes.toLowerCase().includes(brandLower)) return 10
  }

  // Partial credit — we found something, category unknown
  return 5
}

// ── Main scoring function ──────────────────────────────────────────────────────

/**
 * Scores a single candidate in-place and returns it.
 *
 * If `verify` is true, fires a HEAD request to check the image URL.
 * Pass `verify: false` during bulk search to avoid blocking; call separately.
 */
export async function scoreCandidate(
  candidate: RepairCandidate,
  product: Product,
  options: { verify?: boolean } = { verify: true },
): Promise<RepairCandidate> {
  // ── Image verification ────────────────────────────────────────────────────
  if (options.verify && candidate.imageUrl && candidate.imageVerified === undefined) {
    candidate.imageVerified = await verifyImageUrl(candidate.imageUrl)
  }

  // ── Score components ──────────────────────────────────────────────────────
  const imageScore    = computeImageScore(candidate)
  const titleScore    = computeTitleScore(candidate, product.title)
  const priceScore    = computePriceScore(candidate, product.price)
  const reviewScore   = computeReviewScore(candidate)
  const categoryScore = computeCategoryScore(candidate, product)

  candidate.scoreBreakdown = { imageScore, titleScore, priceScore, reviewScore, categoryScore }
  candidate.confidence = imageScore + titleScore + priceScore + reviewScore + categoryScore

  return candidate
}

/**
 * Scores all candidates for a product in parallel (with image verification).
 * Returns candidates sorted by confidence descending.
 */
export async function scoreCandidates(
  candidates: RepairCandidate[],
  product: Product,
  options: { verify?: boolean } = { verify: true },
): Promise<RepairCandidate[]> {
  const scored = await Promise.all(
    candidates.map(c => scoreCandidate(c, product, options)),
  )
  return scored.sort((a, b) => b.confidence - a.confidence)
}
