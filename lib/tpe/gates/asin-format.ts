import type { CandidateRecord, GateResult } from '@/types'

const ASIN_REGEX = /^[A-Z0-9]{10}$/

export function runAsinFormat(candidate: CandidateRecord, now: string): GateResult {
  const start = Date.now()

  if (!candidate.asin) {
    return {
      gateId: 'asin_format',
      passed: false,
      checkedAt: now,
      detail: 'ASIN field is empty or undefined',
      durationMs: Date.now() - start,
    }
  }

  const passed = ASIN_REGEX.test(candidate.asin)
  return {
    gateId: 'asin_format',
    passed,
    checkedAt: now,
    detail: passed ? undefined : `ASIN "${candidate.asin}" does not match /^[A-Z0-9]{10}$/`,
    durationMs: Date.now() - start,
  }
}
