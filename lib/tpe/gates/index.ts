/**
 * lib/tpe/gates/index.ts
 *
 * Gate orchestrator for the Trusted Product Engine.
 *
 * Phase 3D: Business Trust / Presentation Trust separation.
 *
 *   Business Gates — admission gates (failure = REJECTED, never enters catalog):
 *     1. asin_format
 *     2. data_complete
 *     3. price_valid
 *     4. colombia_unrestricted
 *     5. colombia_confirmed
 *     6. status_active
 *     7. amazon_reachable  ← HTTP; runs last within business gates
 *
 *   Presentation Gates — display quality gates (failure = IMAGE_DEGRADED, enters catalog):
 *     8. image_not_placeholder  ← local, runs before HTTP
 *     9. image_accessible       ← HTTP to image CDN
 *
 *   Revalidation-only gate:
 *    10. validation_fresh
 *
 * ValidationBundle.allPassed         = true when all 9 admission gates pass (ACTIVE)
 * ValidationBundle.businessGatesPassed = true when all 7 business gates pass (ACTIVE or IMAGE_DEGRADED)
 */

import type { CandidateRecord, GateId, GateResult, ValidationBundle } from '@/types'
import { runAsinFormat }           from './asin-format'
import { runDataComplete }         from './data-complete'
import { runPriceValid }           from './price-valid'
import { runColombiaUnrestricted } from './colombia-unrestricted'
import { runColombiaConfirmed }    from './colombia-confirmed'
import { runStatusActive }         from './status-active'
import { runImageNotPlaceholder }  from './image-not-placeholder'
import { runImageAccessible }      from './image-accessible'
import { runAmazonReachable }      from './amazon-reachable'

// ── Gate classification ───────────────────────────────────────────────────────

export const BUSINESS_GATE_IDS: readonly GateId[] = [
  'asin_format',
  'data_complete',
  'price_valid',
  'colombia_unrestricted',
  'colombia_confirmed',
  'status_active',
  'amazon_reachable',
] as const

export const PRESENTATION_GATE_IDS: readonly GateId[] = [
  'image_not_placeholder',
  'image_accessible',
] as const

export function isBusinessGate(id: GateId): boolean {
  return (BUSINESS_GATE_IDS as readonly string[]).includes(id)
}

export function isPresentationGate(id: GateId): boolean {
  return (PRESENTATION_GATE_IDS as readonly string[]).includes(id)
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Total admission gates: 7 business + 2 presentation */
const TOTAL_ADMISSION_GATES = 9

// ── Business gate computation ─────────────────────────────────────────────────

/**
 * Returns true when all 7 business gates are present in `gates` and all passed.
 * Used to determine if a candidate is admission-eligible (ACTIVE or IMAGE_DEGRADED).
 */
export function computeBusinessGatesPassed(gates: GateResult[]): boolean {
  const gateMap = new Map(gates.map(g => [g.gateId, g]))
  return BUSINESS_GATE_IDS.every(id => gateMap.get(id)?.passed === true)
}

// ── Local gate pipeline (Phase 3A, gates 1–6) ────────────────────────────────

const LOCAL_GATE_FNS = [
  runAsinFormat,
  runDataComplete,
  runPriceValid,
  runColombiaUnrestricted,
  runColombiaConfirmed,
  runStatusActive,
] as const

/**
 * Run all 6 local business gates against a single candidate.
 *
 * Pure — no network calls, no pool writes.
 * businessGatesPassed = false because Gate 7 has not run yet.
 */
export function runLocalGates(candidate: CandidateRecord): ValidationBundle {
  const startMs = Date.now()
  const now = new Date().toISOString()

  const gates: GateResult[] = []
  for (const gateFn of LOCAL_GATE_FNS) {
    const result = gateFn(candidate, now)
    gates.push(result)
    if (!result.passed) break
  }

  return buildBundle(candidate, gates, false, now, startMs)
}

// ── HTTP gate pipeline (Phase 3B, gates 8→9→7) ───────────────────────────────

/**
 * Run presentation gates (8→9) then business Gate 7 for a candidate that
 * already passed all 6 local business gates.
 *
 * Execution order: Gate 8 (local placeholder check), Gate 9 (image CDN HTTP),
 * Gate 7 (Amazon HTTP — runs last, most likely to rate-limit).
 *
 * allPassed = true only when all 9 gates pass (ACTIVE state).
 * businessGatesPassed = true when gates 1-7 all pass (ACTIVE or IMAGE_DEGRADED).
 *
 * Throws if called on a candidate that has not passed local gates.
 */
export async function runHttpGates(candidate: CandidateRecord): Promise<ValidationBundle> {
  const localBundle = candidate.lastBundle
  if (!localBundle || !localGatesPassed(localBundle)) {
    throw new Error(
      `runHttpGates called on candidate ${candidate.id} that has not passed local gates`,
    )
  }

  const startMs = Date.now()
  const now = new Date().toISOString()

  const gates: GateResult[] = [...localBundle.gates]

  // ── Gate 8: image_not_placeholder (local, before any HTTP) ───────────────
  const g8 = runImageNotPlaceholder(candidate, now)
  gates.push(g8)
  // Gate 8 failure: IMAGE_DEGRADED candidate — still run Gate 7 (business gate)
  if (!g8.passed) {
    const g7 = await runAmazonReachable(candidate, now)
    gates.push(g7)
    return buildBundle(candidate, gates, false, now, startMs)
  }

  // ── Gate 9: image_accessible (HTTP to CDN) ────────────────────────────────
  const g9 = await runImageAccessible(candidate, now)
  gates.push(g9)
  // Gate 9 failure: IMAGE_DEGRADED candidate — still run Gate 7
  if (!g9.passed) {
    const g7 = await runAmazonReachable(candidate, now)
    gates.push(g7)
    return buildBundle(candidate, gates, false, now, startMs)
  }

  // ── Gate 7: amazon_reachable (HTTP to Amazon, runs last) ──────────────────
  const g7 = await runAmazonReachable(candidate, now)
  gates.push(g7)

  const allPassed = gates.length === TOTAL_ADMISSION_GATES && gates.every(g => g.passed)
  return buildBundle(candidate, gates, allPassed, now, startMs)
}

// ── Gate 7 only (Phase 3D — for IMAGE_DEGRADED reclassification) ─────────────

/**
 * Run only Gate 7 (amazon_reachable) for a candidate whose image gates already
 * failed. Appends the Gate 7 result to the existing bundle.
 *
 * Used in Phase 3D to evaluate business reachability for the 180 candidates
 * that were blocked at Gate 8 without ever reaching Gate 7.
 *
 * If Gate 7 passes:
 *   businessGatesPassed = true → candidate is IMAGE_DEGRADED (status: 'approved_degraded')
 * If Gate 7 fails:
 *   businessGatesPassed = false → candidate is REJECTED (status: 'rejected')
 *
 * Does NOT require the candidate to have a clean local bundle — it only needs
 * lastBundle to exist so gate results can be carried over.
 */
export async function runGate7Only(candidate: CandidateRecord): Promise<ValidationBundle> {
  const existingBundle = candidate.lastBundle
  if (!existingBundle) {
    throw new Error(
      `runGate7Only: candidate ${candidate.id} has no lastBundle`,
    )
  }

  const startMs = Date.now()
  const now = new Date().toISOString()

  const gates: GateResult[] = [...existingBundle.gates]

  const g7 = await runAmazonReachable(candidate, now)
  gates.push(g7)

  const allPassed = gates.length === TOTAL_ADMISSION_GATES && gates.every(g => g.passed)
  return buildBundle(candidate, gates, allPassed, now, startMs)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildBundle(
  candidate: CandidateRecord,
  gates:     GateResult[],
  allPassed: boolean,
  now:       string,
  startMs:   number,
): ValidationBundle {
  return {
    candidateId:          candidate.id,
    asin:                 candidate.asin,
    allPassed,
    businessGatesPassed:  computeBusinessGatesPassed(gates),
    gates,
    evaluatedAt:          now,
    evaluatedBy:          'system',
    durationMs:           Date.now() - startMs,
  }
}

/** True if all 6 local gates ran and passed — prerequisite for runHttpGates. */
export function localGatesPassed(bundle: ValidationBundle): boolean {
  return (
    bundle.gates.length >= 6 &&
    bundle.gates.slice(0, 6).every(g => g.passed)
  )
}

/** True if a full admission bundle (9 gates) passed — candidate is ACTIVE. */
export function fullGatesPassed(bundle: ValidationBundle): boolean {
  return bundle.allPassed && bundle.gates.length === TOTAL_ADMISSION_GATES
}
