import type { CandidateRecord, GateResult } from '@/types'

export function runColombiaConfirmed(candidate: CandidateRecord, now: string): GateResult {
  const start = Date.now()
  const passed = candidate.shipsToColombiaConfirmed === true

  return {
    gateId: 'colombia_confirmed',
    passed,
    checkedAt: now,
    detail: passed
      ? undefined
      : `shipsToColombiaConfirmed is ${JSON.stringify(candidate.shipsToColombiaConfirmed)} — must be explicitly true`,
    durationMs: Date.now() - start,
  }
}
