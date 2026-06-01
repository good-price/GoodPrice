/**
 * lib/tpe/admission.ts
 *
 * Orchestrates the admission pipeline: runs gates, updates the pool.
 *
 * Phase 3A: local gates only (gates 1–6).
 * Phase 3B: HTTP gates (8→9→7). Sets status='approved' when all 9 pass.
 * Phase 3D: Gate 7 only for image-rejected candidates.
 *           Sets status='approved_degraded' when all 7 business gates pass
 *           (candidate enters catalog as IMAGE_DEGRADED).
 *
 * Status transitions:
 *   business gates all pass + presentation gates all pass → 'approved'       (ACTIVE)
 *   business gates all pass + presentation gate fails     → 'approved_degraded' (IMAGE_DEGRADED)
 *   any business gate fails + evaluationCount+1 < 3      → 'rejected'
 *   any business gate fails + evaluationCount+1 >= 3     → 'exhausted'
 *   all 6 local gates pass, Gate 7 not yet run           → 'pending'
 */

import type { CandidateRecord, CandidateStatus, ValidationBundle, GateId } from '@/types'
import { runLocalGates, runHttpGates, runGate7Only, localGatesPassed } from '@/lib/tpe/gates'
import { getCandidatePool, saveCandidatePool } from '@/lib/tpe/pool'

// ── Constants ────────────────���───────────────────────────��────────────────────

const EXHAUSTED_THRESHOLD = 3  // rejections before status becomes 'exhausted'

// ── Types ──────────────────���────────────────────────────��─────────────────────

export interface EvaluationRecord {
  candidateId:      string
  asin:             string
  title:            string
  category:         string
  outcome:          'passed_local' | 'rejected' | 'exhausted'
  failedGate?:      GateId
  failDetail?:      string
  evaluationCount:  number
  bundle:           ValidationBundle
}

export interface LocalEvaluationReport {
  runAt:            string
  durationMs:       number
  total:            number
  passedLocalGates: number
  rejected:         number
  exhausted:        number
  topRejectionReasons: { gate: GateId; count: number; sampleDetail: string }[]
  byCategory: {
    category:         string
    total:            number
    passedLocalGates: number
    rejected:         number
  }[]
  records: EvaluationRecord[]
}

// ── Single-candidate evaluation ───��───────────────────────────────────────────

/**
 * Evaluate one candidate through local gates and return the result.
 * Does NOT write to the pool — use evaluateBatch() or apply manually.
 */
export function evaluateCandidateLocal(
  candidate: CandidateRecord,
): { updated: CandidateRecord; record: EvaluationRecord } {
  const bundle = runLocalGates(candidate)
  const failedGate = bundle.gates.find(g => !g.passed)
  const newCount = candidate.evaluationCount + 1

  let outcome: EvaluationRecord['outcome']
  let updatedStatus = candidate.status

  if (failedGate) {
    updatedStatus = newCount >= EXHAUSTED_THRESHOLD ? 'exhausted' : 'rejected'
    outcome = updatedStatus
  } else {
    // All 6 local gates passed — stays pending, waiting for HTTP gates (Phase 3B)
    outcome = 'passed_local'
    updatedStatus = 'pending'
  }

  const now = new Date().toISOString()

  const updated: CandidateRecord = {
    ...candidate,
    status:          updatedStatus,
    evaluationCount: newCount,
    lastBundle:      bundle,
    ...(failedGate ? {
      rejectionGate: failedGate.gateId,
      rejectedAt:    now,
    } : {}),
  }

  const record: EvaluationRecord = {
    candidateId:     candidate.id,
    asin:            candidate.asin,
    title:           candidate.title,
    category:        candidate.category,
    outcome,
    failedGate:      failedGate?.gateId,
    failDetail:      failedGate?.detail,
    evaluationCount: newCount,
    bundle,
  }

  return { updated, record }
}

// ── Batch evaluation ───────────────���──────────────────────────────────────────

/**
 * Evaluate all (or a limited number of) pending candidates through local gates.
 * Writes results to the pool in a single save operation.
 */
export function evaluateLocalBatch(options: {
  limit?:  number   // max candidates to process; default = all pending
  dryRun?: boolean  // if true, compute but do not write to pool
} = {}): LocalEvaluationReport {
  const startMs = Date.now()
  const runAt = new Date().toISOString()

  const store = getCandidatePool()
  const pending = store.candidates.filter(c => c.status === 'pending')
  const toEvaluate = options.limit ? pending.slice(0, options.limit) : pending

  const records: EvaluationRecord[] = []
  const updatedById = new Map<string, CandidateRecord>()

  for (const candidate of toEvaluate) {
    const { updated, record } = evaluateCandidateLocal(candidate)
    records.push(record)
    updatedById.set(candidate.id, updated)
  }

  // ── Persist in a single write ─────────────���───────────────────────────────
  if (!options.dryRun && updatedById.size > 0) {
    const updatedCandidates = store.candidates.map(c =>
      updatedById.has(c.id) ? updatedById.get(c.id)! : c,
    )
    saveCandidatePool({ ...store, candidates: updatedCandidates })
  }

  // ── Aggregate report ───────────────��──────────────────────────────��───────
  const passedLocalGates = records.filter(r => r.outcome === 'passed_local').length
  const rejected         = records.filter(r => r.outcome === 'rejected').length
  const exhausted        = records.filter(r => r.outcome === 'exhausted').length

  // Top rejection reasons: group by failedGate
  const rejectionMap = new Map<GateId, { count: number; sampleDetail: string }>()
  for (const r of records) {
    if (r.failedGate) {
      const entry = rejectionMap.get(r.failedGate)
      if (entry) {
        entry.count += 1
      } else {
        rejectionMap.set(r.failedGate, { count: 1, sampleDetail: r.failDetail ?? '' })
      }
    }
  }
  const topRejectionReasons = Array.from(rejectionMap.entries())
    .map(([gate, { count, sampleDetail }]) => ({ gate, count, sampleDetail }))
    .sort((a, b) => b.count - a.count)

  // Per-category breakdown
  const catMap = new Map<string, { total: number; passedLocalGates: number; rejected: number }>()
  for (const r of records) {
    const entry = catMap.get(r.category) ?? { total: 0, passedLocalGates: 0, rejected: 0 }
    entry.total += 1
    if (r.outcome === 'passed_local') entry.passedLocalGates += 1
    else entry.rejected += 1
    catMap.set(r.category, entry)
  }
  const byCategory = Array.from(catMap.entries())
    .map(([category, stats]) => ({ category, ...stats }))
    .sort((a, b) => b.total - a.total)

  return {
    runAt,
    durationMs: Date.now() - startMs,
    total: records.length,
    passedLocalGates,
    rejected,
    exhausted,
    topRejectionReasons,
    byCategory,
    records,
  }
}

// ── HTTP evaluation (Phase 3B) ────────────────────────────────────────────────

export interface HttpEvaluationReport {
  runAt:             string
  durationMs:        number
  total:             number   // candidates evaluated
  approved:          number   // approvedActive + approvedDegraded (total admitted)
  approvedActive:    number   // all 9 gates passed → ACTIVE
  approvedDegraded:  number   // business gates passed, presentation failed → IMAGE_DEGRADED
  rejected:          number
  exhausted:         number
  topRejectionReasons: { gate: GateId; count: number; sampleDetail: string }[]
  byCategory: {
    category:  string
    total:     number
    approved:  number
    rejected:  number
  }[]
  records: HttpEvaluationRecord[]
}

export interface HttpEvaluationRecord {
  candidateId:     string
  asin:            string
  title:           string
  category:        string
  outcome:         'approved_active' | 'approved_degraded' | 'rejected' | 'exhausted'
  failedGate?:     GateId
  failDetail?:     string
  evaluationCount: number
  bundle:          ValidationBundle
}

// ── Outcome helper ────────────────────────────────────────────────────────────

/**
 * Determine the HTTP evaluation outcome from a completed ValidationBundle.
 * Uses businessGatesPassed + allPassed to distinguish ACTIVE vs IMAGE_DEGRADED.
 */
function determineHttpOutcome(
  bundle:   ValidationBundle,
  newCount: number,
): { outcome: HttpEvaluationRecord['outcome']; status: CandidateStatus } {
  if (bundle.allPassed) {
    return { outcome: 'approved_active', status: 'approved' }
  }
  if (bundle.businessGatesPassed) {
    return { outcome: 'approved_degraded', status: 'approved_degraded' }
  }
  const status: CandidateStatus = newCount >= EXHAUSTED_THRESHOLD ? 'exhausted' : 'rejected'
  return { outcome: status as 'rejected' | 'exhausted', status }
}

/**
 * Evaluate one candidate through HTTP gates (8 -> 9 -> 7).
 * Candidate must have status='pending' and a passing local bundle.
 * Does NOT write to pool — caller must do that.
 *
 * Phase 3D: runHttpGates now runs Gate 7 even when Gate 8 fails, so both
 * 'approved_active' and 'approved_degraded' outcomes are possible.
 */
export async function evaluateCandidateHttp(
  candidate: CandidateRecord,
): Promise<{ updated: CandidateRecord; record: HttpEvaluationRecord }> {
  const bundle = await runHttpGates(candidate)
  const failedGate = bundle.gates.find(g => !g.passed)
  const newCount = candidate.evaluationCount + 1
  const now = new Date().toISOString()

  const { outcome, status: updatedStatus } = determineHttpOutcome(bundle, newCount)
  const isApproved = outcome === 'approved_active' || outcome === 'approved_degraded'

  const updated: CandidateRecord = {
    ...candidate,
    status:          updatedStatus,
    evaluationCount: newCount,
    lastBundle:      bundle,
    ...(isApproved ? { firstApprovedAt: candidate.firstApprovedAt ?? now } : {}),
    ...(!isApproved ? {
      rejectionGate: failedGate?.gateId,
      rejectedAt:    now,
    } : {}),
  }

  const record: HttpEvaluationRecord = {
    candidateId:     candidate.id,
    asin:            candidate.asin,
    title:           candidate.title,
    category:        candidate.category,
    outcome,
    failedGate:      failedGate?.gateId,
    failDetail:      failedGate?.detail,
    evaluationCount: newCount,
    bundle,
  }

  return { updated, record }
}

/**
 * Evaluate all (or a limited number of) pending candidates that passed local
 * gates through the HTTP gates (8 -> 9 -> 7).
 *
 * Requests are serialised — no parallel fetch — to respect Amazon rate limits.
 * Each candidate that reaches Gate 7 (amazon_reachable) waits `amazonDelayMs`
 * before the next Amazon request.
 *
 * Writes results to the pool in a single save operation at the end.
 */
export async function evaluateHttpBatch(options: {
  limit?:         number   // max candidates to process; default = all eligible
  dryRun?:        boolean  // if true, compute but do not write pool
  amazonDelayMs?: number   // delay between Amazon requests; default = 1500ms
  onProgress?:    (done: number, total: number, lastId: string) => void
} = {}): Promise<HttpEvaluationReport> {
  const startMs = Date.now()
  const runAt = new Date().toISOString()
  const { amazonDelayMs = 1500, dryRun = false } = options

  const store = getCandidatePool()

  // Only evaluate pending candidates that passed all 6 local gates
  const eligible = store.candidates.filter(
    c =>
      c.status === 'pending' &&
      c.lastBundle !== undefined &&
      localGatesPassed(c.lastBundle),
  )

  const toEvaluate = options.limit ? eligible.slice(0, options.limit) : eligible
  const records: HttpEvaluationRecord[] = []
  const updatedById = new Map<string, CandidateRecord>()
  let amazonRequestCount = 0

  for (let i = 0; i < toEvaluate.length; i++) {
    const candidate = toEvaluate[i]
    options.onProgress?.(i, toEvaluate.length, candidate.id)

    const willReachAmazon = candidate.lastBundle !== undefined  // local gates passed
    // Apply delay before Amazon requests (not before the first one)
    if (willReachAmazon && amazonRequestCount > 0) {
      await sleep(amazonDelayMs)
    }

    const { updated, record } = await evaluateCandidateHttp(candidate)
    records.push(record)
    updatedById.set(candidate.id, updated)

    // Gate 7 now runs for every candidate (even when Gate 8 fails)
    amazonRequestCount++
  }

  options.onProgress?.(toEvaluate.length, toEvaluate.length, 'done')

  // Persist in a single write
  if (!dryRun && updatedById.size > 0) {
    const updatedCandidates = store.candidates.map(c =>
      updatedById.has(c.id) ? updatedById.get(c.id)! : c,
    )
    saveCandidatePool({ ...store, candidates: updatedCandidates })
  }

  // Aggregate — Phase 3D outcomes
  const approvedActive    = records.filter(r => r.outcome === 'approved_active').length
  const approvedDegraded  = records.filter(r => r.outcome === 'approved_degraded').length
  const approved          = approvedActive + approvedDegraded  // backward compat total
  const rejected          = records.filter(r => r.outcome === 'rejected').length
  const exhausted         = records.filter(r => r.outcome === 'exhausted').length

  const rejectionMap = new Map<GateId, { count: number; sampleDetail: string }>()
  for (const r of records) {
    if (r.failedGate) {
      const entry = rejectionMap.get(r.failedGate)
      if (entry) entry.count++
      else rejectionMap.set(r.failedGate, { count: 1, sampleDetail: r.failDetail ?? '' })
    }
  }
  const topRejectionReasons = Array.from(rejectionMap.entries())
    .map(([gate, { count, sampleDetail }]) => ({ gate, count, sampleDetail }))
    .sort((a, b) => b.count - a.count)

  const catMap = new Map<string, { total: number; approved: number; rejected: number }>()
  for (const r of records) {
    const e = catMap.get(r.category) ?? { total: 0, approved: 0, rejected: 0 }
    e.total++
    if (r.outcome === 'approved_active' || r.outcome === 'approved_degraded') e.approved++
    else e.rejected++
    catMap.set(r.category, e)
  }
  const byCategory = Array.from(catMap.entries())
    .map(([category, stats]) => ({ category, ...stats }))
    .sort((a, b) => b.total - a.total)

  return {
    runAt,
    durationMs:     Date.now() - startMs,
    total:          records.length,
    approved,
    approvedActive,
    approvedDegraded,
    rejected,
    exhausted,
    topRejectionReasons,
    byCategory,
    records,
  }
}

// ── Phase 3D: Gate 7 only (for image-rejected reclassification) ───────────────

export interface Gate7EvaluationRecord {
  candidateId:  string
  asin:         string
  title:        string
  category:     string
  outcome:      'approved_degraded' | 'rejected'
  gate7Passed:  boolean
  gate7Detail?: string
  gate7Http?:   number
  bundle:       ValidationBundle
}

export interface Gate7BatchReport {
  runAt:            string
  durationMs:       number
  total:            number
  approvedDegraded: number  // IMAGE_DEGRADED — business gates pass, image degraded
  rejected:         number  // failed Gate 7 (business gate) — true REJECTED
  byCategory: {
    category:        string
    total:           number
    approvedDegraded: number
    rejected:        number
  }[]
  records: Gate7EvaluationRecord[]
}

/**
 * Evaluate one image-rejected candidate through Gate 7 only (amazon_reachable).
 *
 * Phase 3D: called for candidates with status='rejected' and
 * rejectionGate='image_not_placeholder'. These candidates passed all 6 local
 * gates but were blocked at Gate 8 before Gate 7 could run.
 *
 * Outcome:
 *   Gate 7 passes → 'approved_degraded' (IMAGE_DEGRADED in catalog)
 *   Gate 7 fails  → 'rejected' (true business failure — dead Amazon link)
 *
 * evaluationCount is NOT incremented: this is a continuation of the Phase 3B
 * evaluation that was interrupted by the Gate 8 failure, not a new attempt.
 * rejectionGate/rejectedAt are preserved as audit trail when outcome='rejected'.
 */
export async function evaluateGate7Only(
  candidate: CandidateRecord,
): Promise<{ updated: CandidateRecord; record: Gate7EvaluationRecord }> {
  const bundle = await runGate7Only(candidate)
  const g7 = bundle.gates.find(g => g.gateId === 'amazon_reachable')!
  const now = new Date().toISOString()

  const outcome: Gate7EvaluationRecord['outcome'] = bundle.businessGatesPassed
    ? 'approved_degraded'
    : 'rejected'

  const updated: CandidateRecord = {
    ...candidate,
    status:     outcome === 'approved_degraded' ? 'approved_degraded' : 'rejected',
    lastBundle: bundle,
    // evaluationCount NOT incremented (continuation, not new full attempt)
    ...(outcome === 'rejected' ? {
      rejectionGate: 'amazon_reachable' as const,
      rejectedAt:    now,
    } : {}),
    ...(outcome === 'approved_degraded' ? {
      firstApprovedAt: candidate.firstApprovedAt ?? now,
    } : {}),
  }

  const record: Gate7EvaluationRecord = {
    candidateId:  candidate.id,
    asin:         candidate.asin,
    title:        candidate.title,
    category:     candidate.category,
    outcome,
    gate7Passed:  g7.passed,
    gate7Detail:  g7.detail,
    gate7Http:    g7.httpStatus,
    bundle,
  }

  return { updated, record }
}

/**
 * Evaluate all image-rejected candidates through Gate 7 (Phase 3D).
 *
 * Targets candidates with status='rejected' AND rejectionGate='image_not_placeholder'.
 * Writes results to the pool in a single save operation.
 *
 * Serialised with amazonDelayMs between requests to respect Amazon rate limits.
 */
export async function evaluateGate7Batch(options: {
  limit?:         number
  dryRun?:        boolean
  amazonDelayMs?: number
  onProgress?:    (done: number, total: number, lastId: string) => void
} = {}): Promise<Gate7BatchReport> {
  const startMs = Date.now()
  const runAt = new Date().toISOString()
  const { amazonDelayMs = 1500, dryRun = false } = options

  const store = getCandidatePool()
  const eligible = store.candidates.filter(
    c => c.status === 'rejected' && c.rejectionGate === 'image_not_placeholder',
  )
  const toEvaluate = options.limit ? eligible.slice(0, options.limit) : eligible

  const records: Gate7EvaluationRecord[] = []
  const updatedById = new Map<string, CandidateRecord>()

  for (let i = 0; i < toEvaluate.length; i++) {
    const candidate = toEvaluate[i]
    options.onProgress?.(i, toEvaluate.length, candidate.id)

    if (i > 0) await sleep(amazonDelayMs)

    const { updated, record } = await evaluateGate7Only(candidate)
    records.push(record)
    updatedById.set(candidate.id, updated)
  }

  options.onProgress?.(toEvaluate.length, toEvaluate.length, 'done')

  if (!dryRun && updatedById.size > 0) {
    const updatedCandidates = store.candidates.map(c =>
      updatedById.has(c.id) ? updatedById.get(c.id)! : c,
    )
    saveCandidatePool({ ...store, candidates: updatedCandidates })
  }

  const approvedDegraded = records.filter(r => r.outcome === 'approved_degraded').length
  const rejected         = records.filter(r => r.outcome === 'rejected').length

  const catMap = new Map<string, { total: number; approvedDegraded: number; rejected: number }>()
  for (const r of records) {
    const e = catMap.get(r.category) ?? { total: 0, approvedDegraded: 0, rejected: 0 }
    e.total++
    if (r.outcome === 'approved_degraded') e.approvedDegraded++
    else e.rejected++
    catMap.set(r.category, e)
  }
  const byCategory = Array.from(catMap.entries())
    .map(([category, stats]) => ({ category, ...stats }))
    .sort((a, b) => b.total - a.total)

  return {
    runAt,
    durationMs: Date.now() - startMs,
    total:      records.length,
    approvedDegraded,
    rejected,
    byCategory,
    records,
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
