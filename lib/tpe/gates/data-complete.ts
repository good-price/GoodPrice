import type { CandidateRecord, GateResult } from '@/types'

/**
 * Gate 2: data_complete
 *
 * Hard fails (presence):
 *   id, asin, title, category, image — must be non-empty strings
 *   price, rating, reviews            — must be finite numbers
 *
 * Hard fails (impossible values):
 *   rating outside [0, 5]
 *   reviews < 0
 *   image not starting with 'http'
 *   isOffer === true with no oldPrice (discount claim without base price)
 *   oldPrice set AND oldPrice <= price (incoherent discount)
 */
export function runDataComplete(candidate: CandidateRecord, now: string): GateResult {
  const start = Date.now()
  const issues: string[] = []

  // ── Required string fields ────────────────────────────────────────────────
  const requiredStrings: (keyof CandidateRecord)[] = ['id', 'asin', 'title', 'category', 'image']
  for (const field of requiredStrings) {
    const val = candidate[field]
    if (!val || (typeof val === 'string' && val.trim() === '')) {
      issues.push(`required field "${field}" is missing or empty`)
    }
  }

  // ── Required numeric fields ───────────────────────────────────────────────
  if (!Number.isFinite(candidate.price)) {
    issues.push(`"price" is not a finite number (got ${candidate.price})`)
  }
  if (!Number.isFinite(candidate.rating)) {
    issues.push(`"rating" is not a finite number (got ${candidate.rating})`)
  }
  if (!Number.isFinite(candidate.reviews)) {
    issues.push(`"reviews" is not a finite number (got ${candidate.reviews})`)
  }

  // ── Impossible values ─────────────────────────────────────────────────────
  if (Number.isFinite(candidate.rating) && (candidate.rating < 0 || candidate.rating > 5)) {
    issues.push(`rating ${candidate.rating} is outside the valid range [0, 5]`)
  }
  if (Number.isFinite(candidate.reviews) && candidate.reviews < 0) {
    issues.push(`reviews ${candidate.reviews} cannot be negative`)
  }
  if (candidate.image && !candidate.image.startsWith('http')) {
    issues.push(`image URL does not start with "http": "${candidate.image.slice(0, 60)}"`)
  }
  if (candidate.isOffer === true && candidate.oldPrice === undefined) {
    issues.push('isOffer is true but oldPrice is not set — discount claim requires a base price')
  }
  if (
    candidate.oldPrice !== undefined &&
    Number.isFinite(candidate.oldPrice) &&
    Number.isFinite(candidate.price) &&
    candidate.oldPrice <= candidate.price
  ) {
    issues.push(`oldPrice (${candidate.oldPrice}) ≤ price (${candidate.price}) — incoherent discount`)
  }

  const passed = issues.length === 0
  return {
    gateId: 'data_complete',
    passed,
    checkedAt: now,
    detail: passed ? undefined : issues.join(' | '),
    durationMs: Date.now() - start,
  }
}
