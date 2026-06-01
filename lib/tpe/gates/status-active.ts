/**
 * Gate 6: status_active
 *
 * Reads candidate.productStatus (the original product status preserved from
 * the legacy catalog during migration). Fails if not explicitly 'active'.
 *
 * Note: this gate is a cheap pre-flight check. Gate 7 (amazon_reachable)
 * is the authoritative HTTP confirmation. A product with productStatus
 * 'inactive' will always fail both gates; a product with productStatus
 * 'active' still needs Gate 7 to confirm the Amazon page is reachable.
 */

import type { CandidateRecord, GateResult } from '@/types'

export function runStatusActive(candidate: CandidateRecord, now: string): GateResult {
  const start = Date.now()
  const passed = candidate.productStatus === 'active'

  return {
    gateId: 'status_active',
    passed,
    checkedAt: now,
    detail: passed
      ? undefined
      : `productStatus is "${candidate.productStatus ?? 'undefined'}" — must be "active"`,
    durationMs: Date.now() - start,
  }
}
