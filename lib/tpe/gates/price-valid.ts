import type { CandidateRecord, GateResult } from '@/types'

const PRICE_MIN = 0.01
const PRICE_MAX = 50_000

export function runPriceValid(candidate: CandidateRecord, now: string): GateResult {
  const start = Date.now()
  const { price } = candidate

  if (!Number.isFinite(price)) {
    return {
      gateId: 'price_valid',
      passed: false,
      checkedAt: now,
      detail: `price is not a finite number (got ${price})`,
      durationMs: Date.now() - start,
    }
  }
  if (price < PRICE_MIN) {
    return {
      gateId: 'price_valid',
      passed: false,
      checkedAt: now,
      detail: `price ${price} is below minimum ${PRICE_MIN}`,
      durationMs: Date.now() - start,
    }
  }
  if (price > PRICE_MAX) {
    return {
      gateId: 'price_valid',
      passed: false,
      checkedAt: now,
      detail: `price ${price} exceeds maximum ${PRICE_MAX}`,
      durationMs: Date.now() - start,
    }
  }

  return {
    gateId: 'price_valid',
    passed: true,
    checkedAt: now,
    durationMs: Date.now() - start,
  }
}
