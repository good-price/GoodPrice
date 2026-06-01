/**
 * Gate 4: colombia_unrestricted
 *
 * Two-phase check:
 *   1. Stored restriction: candidate.colombiaRestriction already set → fail immediately.
 *   2. Dynamic rules:      apply COLOMBIA_RULES (block-severity only) using the
 *      candidate's asin, brand, title, and category.
 *
 * Reuses COLOMBIA_RULES from lib/catalog/colombia.ts but applies matching
 * directly against CandidateRecord fields (no Product/amazonUrl dependency).
 */

import { COLOMBIA_RULES } from '@/lib/catalog/colombia'
import type { CandidateRecord, GateResult } from '@/types'

function detectColombiaRestriction(candidate: CandidateRecord): string | null {
  const titleLower = candidate.title.toLowerCase()
  const brandLower = (candidate.brand ?? '').toLowerCase()

  for (const rule of COLOMBIA_RULES) {
    if (rule.severity !== 'block') continue  // only block-severity rules cause gate failure

    let matched = false
    switch (rule.type) {
      case 'brand':
        matched = brandLower === rule.value || brandLower.includes(rule.value)
        break
      case 'asin':
        matched = candidate.asin === rule.value
        break
      case 'keyword':
        matched = titleLower.includes(rule.value)
        break
      case 'category':
        matched = candidate.category === rule.value
        break
    }

    if (matched) return rule.restriction
  }

  return null
}

export function runColombiaUnrestricted(candidate: CandidateRecord, now: string): GateResult {
  const start = Date.now()

  // Phase 1: stored restriction
  if (candidate.colombiaRestriction) {
    return {
      gateId: 'colombia_unrestricted',
      passed: false,
      checkedAt: now,
      detail: `stored restriction: ${candidate.colombiaRestriction}`,
      durationMs: Date.now() - start,
    }
  }

  // Phase 2: dynamic rule check
  const dynamicRestriction = detectColombiaRestriction(candidate)
  if (dynamicRestriction) {
    return {
      gateId: 'colombia_unrestricted',
      passed: false,
      checkedAt: now,
      detail: `Colombia rule matched: ${dynamicRestriction}`,
      durationMs: Date.now() - start,
    }
  }

  return {
    gateId: 'colombia_unrestricted',
    passed: true,
    checkedAt: now,
    durationMs: Date.now() - start,
  }
}
