/**
 * lib/tpe/recovery/recovery-types.ts
 *
 * Internal report types for the Image Recovery pipeline.
 * These types are scoped to the recovery module and scripts.
 *
 * Cross-module types (ImageRecoveryConfidence, RecoveryMetadata, etc.)
 * live in types/tpe.ts and are imported from @/types.
 */

import type { ImageRecoveryConfidence, ImageRecoveryAttempt } from '@/types'

// ── Per-candidate result ───────────────────────────────────────────────────────

export interface CandidateRecoveryResult {
  candidateId:   string
  asin:          string
  title:         string
  category:      string
  originalImage: string
  confidence:    ImageRecoveryConfidence
  verifiedUrl?:  string
  attempt:       ImageRecoveryAttempt
}

// ── Batch report ───────────────────────────────────────────────────────────────

export interface Tier1CategoryStats {
  category:  string
  total:     number      // attempted for recovery
  verified:  number      // confidence='verified'
  broken:    number      // all methods failed
}

export interface Tier1RecoveryReport {
  runAt:       string    // ISO 8601
  durationMs:  number
  evaluated:   number    // candidates attempted
  recovered:   number    // URL built (confidence='recovered' before verify)
  verified:    number    // confirmed HTTP 200 — written to pool
  broken:      number    // no valid URL found
  byCategory:  Tier1CategoryStats[]
  results:     CandidateRecoveryResult[]
}

// ── Combined report (recovery + re-evaluation) ────────────────────────────────

export interface Tier1FullReport {
  recovery:       Tier1RecoveryReport
  reEvaluation: {
    runAt:         string
    durationMs:    number
    total:         number     // candidates re-evaluated after recovery
    approved:      number     // newly approved (allPassed=true)
    rejected:      number
    topGateFailures: { gate: string; count: number }[]
    newlyApproved:   { candidateId: string; category: string; title: string }[]
  }
  totalApprovedAfter: number  // pool approved count after full run
}
