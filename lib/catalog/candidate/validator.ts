/**
 * lib/catalog/candidate/validator.ts
 *
 * Candidate Validator v1 — runs a new ASIN through 9 gates before it can
 * enter the GOODPRICE catalog. Reuses the existing amazon-parser for all
 * live data; adds no new external dependencies.
 *
 * Gate sequence:
 *   1  HTTP 200
 *   2  Not a robot-check / CAPTCHA page
 *   3  Price extractable and > 0
 *   4  Product image found
 *   5  Availability = in_stock or limited
 *   6  Redirect detection (informational — never blocks APPROVED)
 *   7  Rating ≥ minRating
 *   8  Review count ≥ minReviews
 *   9  Price within [minPrice, maxPrice]
 */

import { fetchAndParseProduct } from '@/lib/catalog/live-truth/amazon-parser'
import type {
  CandidateValidationResult,
  CandidateValidationConfig,
  GateResult,
} from './types'

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULTS = {
  minPrice:   20,
  maxPrice:   300,
  minRating:  4.2,
  minReviews: 500,
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function asinFromUrl(url: string): string | null {
  const m = url.match(/\/dp\/([A-Z0-9]{10})/)
  return m ? m[1] : null
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function validateCandidate(
  asin: string,
  config: CandidateValidationConfig = {},
): Promise<CandidateValidationResult> {
  const cfg       = { ...DEFAULTS, ...config }
  const t0        = Date.now()
  const checkedAt = new Date().toISOString()
  const gates: GateResult[] = []

  // Mutable state object accumulates as gates pass — using const object so
  // ESLint prefer-const is satisfied while still allowing property mutation.
  const s = {
    http200:          false,
    redirected:       false,
    finalAsin:        asin,
    priceFound:       false,
    price:            undefined as number | undefined,
    imageFound:       false,
    imageUrl:         undefined as string | undefined,
    availability:     'unknown' as CandidateValidationResult['availability'],
    rating:           undefined as number | undefined,
    reviewCount:      undefined as number | undefined,
    title:            undefined as string | undefined,
    brand:            undefined as string | undefined,
    shipsToColombia:  false,
  }

  function snapshot(reason: string): CandidateValidationResult {
    return {
      asin,
      finalAsin:       s.finalAsin,
      http200:         s.http200,
      redirected:      s.redirected,
      priceFound:      s.priceFound,
      price:           s.price,
      imageFound:      s.imageFound,
      imageUrl:        s.imageUrl,
      availability:    s.availability,
      rating:          s.rating,
      reviewCount:     s.reviewCount,
      title:           s.title,
      brand:           s.brand,
      shipsToColombia: s.shipsToColombia,
      decision:        'REJECTED',
      reason,
      gates,
      checkedAt,
      durationMs:      Date.now() - t0,
    }
  }

  function pass(gate: number, name: string, value?: unknown, detail?: string): void {
    gates.push({ gate, name, passed: true, value, detail })
  }

  function fail(gate: number, name: string, reason: string, value?: unknown): CandidateValidationResult {
    gates.push({ gate, name, passed: false, value, detail: reason })
    return snapshot(reason)
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const extracted = await fetchAndParseProduct(asin)

  // Gate 1 — HTTP 200
  if (extracted.httpStatus !== 200) {
    return fail(1, 'HTTP 200', `http_error: ${extracted.httpStatus ?? 'network_failure'}`, extracted.httpStatus)
  }
  s.http200 = true
  pass(1, 'HTTP 200', 200)

  // Gate 2 — Not robot-check / CAPTCHA
  if (extracted.isRobotCheck) {
    return fail(2, 'Not blocked', 'robot_check')
  }
  pass(2, 'Not blocked')

  // Gate 3 — Price extractable and > 0
  if (!extracted.priceUSD || extracted.priceUSD <= 0) {
    return fail(3, 'Price > 0', 'no_price', extracted.priceUSD)
  }
  s.priceFound = true
  s.price = extracted.priceUSD
  pass(3, 'Price > 0', s.price)

  // Gate 4 — Image found
  if (!extracted.imageUrl) {
    return fail(4, 'Image found', 'no_image')
  }
  s.imageFound = true
  s.imageUrl = extracted.imageUrl
  pass(4, 'Image found')

  // Gate 5 — Availability
  const avStatus = extracted.availabilityStatus
  if (avStatus !== 'in_stock' && avStatus !== 'limited') {
    s.availability = 'unavailable'
    return fail(5, 'Available', `unavailable: ${avStatus}`, avStatus)
  }
  s.availability = 'available'
  pass(5, 'Available', avStatus)

  // Gate 6 — Redirect detection (informational — never rejects)
  const rAsin = extracted.finalUrl ? asinFromUrl(extracted.finalUrl) : null
  s.redirected = !!rAsin && rAsin !== asin
  s.finalAsin  = s.redirected ? rAsin! : asin
  pass(6, 'Redirect check', s.redirected ? `→ ${s.finalAsin}` : 'none')

  // Gate 7 — Rating ≥ minRating
  s.rating = extracted.rating
  if (s.rating === undefined) {
    return fail(7, `Rating ≥ ${cfg.minRating}`, 'rating_not_found')
  }
  if (s.rating < cfg.minRating) {
    return fail(7, `Rating ≥ ${cfg.minRating}`, `low_rating: ${s.rating}`, s.rating)
  }
  pass(7, `Rating ≥ ${cfg.minRating}`, s.rating)

  // Gate 8 — Review count ≥ minReviews
  s.reviewCount = extracted.reviewCount
  if (s.reviewCount === undefined) {
    return fail(8, `Reviews ≥ ${cfg.minReviews}`, 'review_count_not_found')
  }
  if (s.reviewCount < cfg.minReviews) {
    return fail(8, `Reviews ≥ ${cfg.minReviews}`, `insufficient_reviews: ${s.reviewCount}`, s.reviewCount)
  }
  pass(8, `Reviews ≥ ${cfg.minReviews}`, s.reviewCount)

  // Gate 9 — Price in [minPrice, maxPrice]
  if (s.price < cfg.minPrice) {
    return fail(9, `Price $${cfg.minPrice}–$${cfg.maxPrice}`, `price_too_low: $${s.price}`, s.price)
  }
  if (s.price > cfg.maxPrice) {
    return fail(9, `Price $${cfg.minPrice}–$${cfg.maxPrice}`, `price_too_high: $${s.price}`, s.price)
  }
  pass(9, `Price $${cfg.minPrice}–$${cfg.maxPrice}`, s.price)

  // Ships to Colombia — best-effort: true when no restriction phrase detected.
  s.shipsToColombia = !(extracted.shippingRestriction ?? false)
  s.title           = extracted.title
  s.brand           = extracted.brand

  return {
    asin,
    finalAsin:       s.finalAsin,
    http200:         s.http200,
    redirected:      s.redirected,
    priceFound:      s.priceFound,
    price:           s.price,
    imageFound:      s.imageFound,
    imageUrl:        s.imageUrl,
    availability:    s.availability,
    rating:          s.rating,
    reviewCount:     s.reviewCount,
    title:           s.title,
    brand:           s.brand,
    shipsToColombia: s.shipsToColombia,
    decision:        'APPROVED',
    gates,
    checkedAt,
    durationMs:      Date.now() - t0,
  }
}
