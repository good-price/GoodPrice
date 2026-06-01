/**
 * lib/tpe/recovery/image-recovery.ts
 *
 * Orchestrates image recovery for a single candidate (Tier 1: CDN swap).
 *
 * Recovery confidence contract:
 *   'recovered' — a candidate URL was built but has NOT been HTTP-verified.
 *                 This state is transient and internal to this function.
 *   'verified'  — the candidate URL returned HTTP 200. Safe to write to pool.
 *   'broken'    — the URL is not a legacy /I/ format (not applicable to this tier),
 *                 or the swap URL failed HTTP verification.
 *
 * ONLY 'verified' results produce an updatedCandidate.
 * 'broken' results return the original candidate unchanged.
 *
 * Pool invariant: candidate.image is ONLY updated when confidence='verified'.
 */

import type {
  CandidateRecord,
  ValidationBundle,
  ImageRecoveryAttempt,
  ImageRecoveryConfidence,
  RecoveryMetadata,
} from '@/types'
import { buildSwappedUrl, isLegacyICdnUrl, extractImageHash } from './image-swap'
import { verifyImageUrl } from './image-verify'

// ── Public API ─────────────────────────────────────────────────────────────────

export interface RecoveryOutcome {
  confidence:       ImageRecoveryConfidence
  attempt:          ImageRecoveryAttempt
  updatedCandidate?: CandidateRecord   // only present when confidence='verified'
}

/**
 * Attempt to recover a valid image URL for the given candidate via CDN swap.
 *
 * The function:
 *   1. Checks the candidate's image URL is a legacy /I/ format (Tier 1 scope)
 *   2. Builds the m.media-amazon.com swap URL
 *   3. Verifies the swap URL via HTTP
 *   4. If verified: returns an updatedCandidate with the new image URL,
 *      recovery metadata, status='pending', and a local-only bundle for re-eval
 *   5. If broken: returns the original candidate with updated recovery metadata
 *
 * Preserved on success:
 *   evaluationCount   — not incremented (recovery is not an evaluation)
 *   rejectedAt        — audit trail of prior rejection
 *   rejectionGate     — audit trail of prior rejection
 *   lastBundle        — reset to local-only (6 gates) to enable re-evaluation
 */
export async function recoverLegacyImage(candidate: CandidateRecord): Promise<RecoveryOutcome> {
  const attemptedAt = new Date().toISOString()

  // ── Guard: only applicable to legacy /I/ format ───────────────────────────
  if (!isLegacyICdnUrl(candidate.image)) {
    const attempt: ImageRecoveryAttempt = {
      attemptedAt,
      source:      'cdn_swap',
      originalUrl: candidate.image,
      confidence:  'broken',
      detail:      'URL is not a legacy images-na /I/ format — Tier 1 not applicable',
      durationMs:  0,
    }
    return { confidence: 'broken', attempt }
  }

  // ── Build swap URL ────────────────────────────────────────────────────────
  const swappedUrl = buildSwappedUrl(candidate.image)!
  const hash = extractImageHash(candidate.image)

  // ── Verify the swapped URL ────────────────────────────────────────────────
  const verify = await verifyImageUrl(swappedUrl)

  if (!verify.accessible) {
    const attempt: ImageRecoveryAttempt = {
      attemptedAt,
      source:        'cdn_swap',
      originalUrl:   candidate.image,
      recoveredUrl:  swappedUrl,
      confidence:    'broken',
      httpStatus:    verify.httpStatus,
      detail:        verify.detail ?? `hash ${hash ?? 'unknown'} not found on m.media-amazon.com`,
      durationMs:    verify.durationMs,
    }
    const updatedCandidate = applyRecoveryMetadata(candidate, attempt, null)
    return { confidence: 'broken', attempt, updatedCandidate }
  }

  // ── Verified: build the updated candidate ────────────────────────────────
  const now = new Date().toISOString()

  const attempt: ImageRecoveryAttempt = {
    attemptedAt,
    source:       'cdn_swap',
    originalUrl:  candidate.image,
    recoveredUrl: swappedUrl,
    verifiedUrl:  swappedUrl,
    confidence:   'verified',
    httpStatus:   verify.httpStatus,
    detail:       `hash ${hash ?? 'unknown'} confirmed on m.media-amazon.com (HTTP ${verify.httpStatus})`,
    durationMs:   verify.durationMs,
  }

  const updatedCandidate = applyRecoveryMetadata(candidate, attempt, swappedUrl)

  // Update image and reset status to pending for re-evaluation
  const localOnlyBundle = rebuildLocalBundle(candidate, now)

  const final: CandidateRecord = {
    ...updatedCandidate,
    image:      swappedUrl,  // THE only field change visible to the public catalog
    status:     'pending',   // re-queue for Gate 8 → 9 → 7
    lastBundle: localOnlyBundle,
    // evaluationCount preserved — recovery is not an evaluation pass
    // rejectedAt/rejectionGate preserved — audit trail of prior rejection
  }

  return { confidence: 'verified', attempt, updatedCandidate: final }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build or update RecoveryMetadata on the candidate. */
function applyRecoveryMetadata(
  candidate:   CandidateRecord,
  attempt:     ImageRecoveryAttempt,
  verifiedUrl: string | null,
): CandidateRecord {
  const existing = candidate.recoveryMetadata
  const updated: RecoveryMetadata = {
    lastAttemptAt:  attempt.attemptedAt,
    lastConfidence: attempt.confidence,
    source:         attempt.source,
    verifiedUrl:    verifiedUrl ?? existing?.verifiedUrl,
    verifiedAt:     verifiedUrl ? attempt.attemptedAt : existing?.verifiedAt,
    attempts:       [...(existing?.attempts ?? []), attempt],
  }
  return { ...candidate, recoveryMetadata: updated }
}

/**
 * Reconstruct a local-only ValidationBundle from the candidate's last bundle.
 * Extracts the first 6 gates (which all passed in Phase 3A) and sets
 * allPassed=false so the HTTP gate pipeline will pick this candidate up.
 *
 * This does NOT re-run local gates — they are assumed still valid since
 * the candidate's non-image fields have not changed.
 */
function rebuildLocalBundle(candidate: CandidateRecord, now: string): ValidationBundle {
  const lastBundle = candidate.lastBundle

  if (!lastBundle || lastBundle.gates.length < 6) {
    // Fallback: should not happen for candidates that went through Phase 3A
    throw new Error(
      `Cannot rebuild local bundle for candidate ${candidate.id}: lastBundle missing or incomplete`,
    )
  }

  return {
    ...lastBundle,
    gates:       lastBundle.gates.slice(0, 6),   // first 6 local gates only
    allPassed:   false,
    evaluatedAt: now,
  }
}
