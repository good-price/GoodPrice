/**
 * scripts/recover-gate7.ts
 *
 * Sprint 4A — Gate 7 Recovery
 *
 * Re-evaluates every candidate wrongly rejected at amazon_reachable due to
 * HTTP 405 under the old Gate 7 behaviour (Zero Trust hard-fail on 405).
 *
 * Old behaviour (before fix):
 *   HEAD → 405  → FAIL  (treated as unknown state)
 *
 * Current Gate 7 behaviour (amazon-reachable.ts):
 *   HEAD → 200/30x  → PASS
 *   HEAD → 405      → GET fallback
 *     GET → 200/30x → PASS   ← this is the recovery path
 *     GET → 404     → FAIL
 *     GET → timeout → FAIL
 *   HEAD → 404      → FAIL
 *   HEAD → timeout  → FAIL
 *
 * Target:
 *   All candidates with rejectionGate === 'amazon_reachable' (any lifecycle status,
 *   including 'exhausted').  A 405 rejection was never a true business failure —
 *   it was a method-restriction artefact.  All 26 targets deserve a clean retry.
 *
 * Recovery flow per candidate:
 *   1. Strip the stale amazon_reachable result from lastBundle.gates
 *   2. Re-run Gate 7 with the current logic (HEAD → 405 → GET fallback)
 *   3. Append the new Gate 7 result
 *   4. Recompute businessGatesPassed + allPassed
 *   5. Determine new status:
 *        Gate 7 passes + allPassed = true  → 'approved'          (ACTIVE)
 *        Gate 7 passes + allPassed = false → 'approved_degraded' (IMAGE_DEGRADED)
 *        Gate 7 still fails               → 'rejected'           (or 'exhausted')
 *   6. evaluationCount is NOT incremented: this is a recovery, not a new evaluation
 *
 * After pool update → rebuild catalog → report.
 *
 * Usage (from goodprice/ directory):
 *   npx tsx scripts/recover-gate7.ts
 *   npx tsx scripts/recover-gate7.ts --dry-run
 *   npx tsx scripts/recover-gate7.ts --limit=5
 *   npx tsx scripts/recover-gate7.ts --delay=2000
 */

import { runAmazonReachable }            from '@/lib/tpe/gates/amazon-reachable'
import { computeBusinessGatesPassed }    from '@/lib/tpe/gates'
import { getCandidatePool, saveCandidatePool } from '@/lib/tpe/pool'
import { rebuildCatalog, getCatalogKPI, MAX_SLOTS } from '@/lib/tpe/catalog'
import type { CandidateRecord, CandidateStatus, GateResult, ValidationBundle } from '@/types'

// ── CLI args ──────────────────────────────────────────────────────────────────

const dryRun   = process.argv.includes('--dry-run')
const limitArg = process.argv.find(a => a.startsWith('--limit='))
const delayArg = process.argv.find(a => a.startsWith('--delay='))
const limit    = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined
const delayMs  = delayArg ? parseInt(delayArg.split('=')[1], 10) : 1500

const DIVIDER = '─'.repeat(72)
const TOTAL_ADMISSION_GATES = 9

// ── Bar chart ─────────────────────────────────────────────────────────────────

function bar(value: number, total: number, width = 32): string {
  if (total === 0) return '░'.repeat(width)
  const filled = Math.round((value / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function pct(n: number, d: number, digits = 1): string {
  if (d === 0) return ' 0.' + '0'.repeat(digits) + '%'
  return ((n / d) * 100).toFixed(digits) + '%'
}

// ── Progress ──────────────────────────────────────────────────────────────────

let _lastLine = ''
function progress(msg: string) {
  process.stdout.write(`\r  ${msg.padEnd(68)}`)
  _lastLine = msg
}
function clearProgress() {
  if (_lastLine) process.stdout.write('\r' + ' '.repeat(72) + '\r')
  _lastLine = ''
}

// ── Sleep ─────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Bundle reconstruction ─────────────────────────────────────────────────────

/**
 * Strip any existing amazon_reachable gate result from the bundle's gates array.
 * The caller will re-run Gate 7 and append the fresh result.
 */
function stripGate7(gates: GateResult[]): GateResult[] {
  return gates.filter(g => g.gateId !== 'amazon_reachable')
}

/**
 * Reconstruct a ValidationBundle after replacing the Gate 7 result.
 * Recomputes businessGatesPassed and allPassed from the final gate list.
 */
function rebuildBundle(
  original: ValidationBundle,
  newGates: GateResult[],
  now: string,
): ValidationBundle {
  const businessGatesPassed = computeBusinessGatesPassed(newGates)
  const allPassed = (
    newGates.length === TOTAL_ADMISSION_GATES &&
    newGates.every(g => g.passed)
  )
  return {
    ...original,
    gates:               newGates,
    allPassed,
    businessGatesPassed,
    evaluatedAt:         now,
    durationMs:          newGates.reduce((s, g) => s + g.durationMs, 0),
  }
}

// ── Per-candidate recovery ────────────────────────────────────────────────────

interface RecoveryRecord {
  candidateId:  string
  asin:         string
  title:        string
  category:     string
  prevStatus:   CandidateStatus
  outcome:      'recovered_active' | 'recovered_degraded' | 'still_rejected'
  gate7Passed:  boolean
  gate7Http?:   number
  gate7Detail?: string
  newStatus:    CandidateStatus
}

async function recoverCandidate(
  candidate: CandidateRecord,
): Promise<{ updated: CandidateRecord; record: RecoveryRecord }> {
  if (!candidate.lastBundle) {
    throw new Error(`recover-gate7: candidate ${candidate.id} has no lastBundle`)
  }

  const now = new Date().toISOString()

  // ── Step 1: Strip old Gate 7 ─────────────────────────────────────────────
  const stripped  = stripGate7(candidate.lastBundle.gates)

  // ── Step 2: Re-run Gate 7 with current logic ──────────────────────────────
  const g7 = await runAmazonReachable(candidate, now)

  // ── Step 3: Rebuild bundle ────────────────────────────────────────────────
  const newGates  = [...stripped, g7]
  const newBundle = rebuildBundle(candidate.lastBundle, newGates, now)

  // ── Step 4: Determine new status ──────────────────────────────────────────
  let newStatus: CandidateStatus
  let outcome: RecoveryRecord['outcome']

  if (g7.passed && newBundle.businessGatesPassed) {
    newStatus = newBundle.allPassed ? 'approved' : 'approved_degraded'
    outcome   = newBundle.allPassed ? 'recovered_active' : 'recovered_degraded'
  } else {
    // Still fails — preserve exhausted state if applicable
    newStatus = candidate.status === 'exhausted' ? 'exhausted' : 'rejected'
    outcome   = 'still_rejected'
  }

  // ── Step 5: Build updated candidate ──────────────────────────────────────
  const updated: CandidateRecord = {
    ...candidate,
    status:     newStatus,
    lastBundle: newBundle,
    // evaluationCount NOT incremented — this is a recovery, not a new evaluation attempt
    ...(outcome !== 'still_rejected' ? {
      // Clear rejection markers for recovered candidates
      rejectionGate:   undefined,
      rejectedAt:      undefined,
      firstApprovedAt: candidate.firstApprovedAt ?? now,
    } : {
      // Keep rejection metadata for still-rejected candidates; update gate + timestamp
      rejectionGate: 'amazon_reachable',
      rejectedAt:    now,
    }),
  }

  const record: RecoveryRecord = {
    candidateId:  candidate.id,
    asin:         candidate.asin,
    title:        candidate.title,
    category:     candidate.category,
    prevStatus:   candidate.status,
    outcome,
    gate7Passed:  g7.passed,
    gate7Http:    g7.httpStatus,
    gate7Detail:  g7.detail,
    newStatus,
  }

  return { updated, record }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const scriptStart = Date.now()

  // ── Pre-flight ────────────────────────────────────────────────────────────

  const storeBefore = getCandidatePool()

  const before = {
    inCatalog:    storeBefore.candidates.filter(c => c.status === 'in_catalog').length,
    approved:     storeBefore.candidates.filter(c => c.status === 'approved').length,
    degraded:     storeBefore.candidates.filter(c => c.status === 'approved_degraded').length,
    rejected:     storeBefore.candidates.filter(c => c.status === 'rejected').length,
    exhausted:    storeBefore.candidates.filter(c => c.status === 'exhausted').length,
    g7Targets:    storeBefore.candidates.filter(c => c.rejectionGate === 'amazon_reachable').length,
  }

  const targets = storeBefore.candidates.filter(
    c => c.rejectionGate === 'amazon_reachable',
  )
  const toEvaluate = limit ? targets.slice(0, limit) : targets

  // Category breakdown of targets
  const targetByCat = new Map<string, number>()
  for (const c of toEvaluate) {
    targetByCat.set(c.category, (targetByCat.get(c.category) ?? 0) + 1)
  }

  console.log('\n' + DIVIDER)
  console.log('  GOODPRICE — Trusted Product Engine v1')
  console.log('  Sprint 4A: Gate 7 Recovery (HTTP 405 false-positive reversal)')
  console.log(DIVIDER)
  console.log(`  Dry run:       ${dryRun}`)
  console.log(`  Amazon delay:  ${delayMs}ms`)
  if (limit !== undefined) console.log(`  Limit:         ${limit}`)
  console.log()
  console.log('  PRE-FLIGHT POOL STATE')
  console.log(`  in_catalog:     ${before.inCatalog}`)
  console.log(`  approved:       ${before.approved}`)
  console.log(`  approved_degr:  ${before.degraded}`)
  console.log(`  rejected:       ${before.rejected}`)
  console.log(`  exhausted:      ${before.exhausted}`)
  console.log()
  console.log('  RECOVERY TARGET')
  console.log(`  Candidates with rejectionGate='amazon_reachable': ${before.g7Targets}`)
  console.log(`  (All were rejected due to HTTP 405 under old Gate 7 — no GET fallback)`)
  console.log(`  Will evaluate: ${toEvaluate.length}`)
  console.log()
  console.log('  By category:')
  for (const [cat, n] of Array.from(targetByCat.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(18)} ${n}`)
  }
  console.log()
  console.log(`  Estimated time: ~${Math.ceil(toEvaluate.length * delayMs / 60_000)} minutes`)
  if (dryRun) console.log('\n  [DRY RUN] Pool and catalog will NOT be modified.')
  console.log()

  if (toEvaluate.length === 0) {
    console.log('  No targets found. Nothing to do.')
    console.log(DIVIDER + '\n')
    return
  }

  // ── Run recovery ──────────────────────────────────────────────────────────

  const records: RecoveryRecord[] = []
  const updatedById = new Map<string, CandidateRecord>()

  for (let i = 0; i < toEvaluate.length; i++) {
    const candidate = toEvaluate[i]
    progress(`Gate 7 re-evaluating... ${i + 1}/${toEvaluate.length} — ${candidate.id} (${candidate.asin})`)

    if (i > 0) await sleep(delayMs)

    const { updated, record } = await recoverCandidate(candidate)
    records.push(record)
    updatedById.set(candidate.id, updated)
  }

  clearProgress()

  // ── Write pool + release in_catalog → eligible (single save) ───────────────
  //
  // rebuildCatalog() only considers status='approved' and 'approved_degraded'.
  // Candidates currently status='in_catalog' are invisible to it.  Before the
  // rebuild we therefore release ALL in_catalog candidates back to their proper
  // approved/approved_degraded state so that rebuild can fill all 200 slots in
  // one pass.  rebuildCatalog() will then mark the full set as 'in_catalog'.

  if (!dryRun && updatedById.size > 0) {
    const withRecovered = storeBefore.candidates.map(c =>
      updatedById.has(c.id) ? updatedById.get(c.id)! : c,
    )
    // Release existing in_catalog candidates so rebuildCatalog sees all eligibles
    const withReleased = withRecovered.map(c => {
      if (c.status !== 'in_catalog') return c
      const restoredStatus: CandidateStatus =
        c.lastBundle?.allPassed ? 'approved' : 'approved_degraded'
      return { ...c, status: restoredStatus }
    })
    saveCandidatePool({ ...storeBefore, candidates: withReleased })
  }

  // ── Aggregate recovery results ────────────────────────────────────────────

  const recoveredActive    = records.filter(r => r.outcome === 'recovered_active').length
  const recoveredDegraded  = records.filter(r => r.outcome === 'recovered_degraded').length
  const totalRecovered     = recoveredActive + recoveredDegraded
  const stillRejected      = records.filter(r => r.outcome === 'still_rejected').length

  // Recovered categories
  const recoveredByCat = new Map<string, { active: number; degraded: number; total: number }>()
  for (const r of records) {
    if (r.outcome === 'still_rejected') continue
    const e = recoveredByCat.get(r.category) ?? { active: 0, degraded: 0, total: 0 }
    e.total++
    if (r.outcome === 'recovered_active') e.active++
    else e.degraded++
    recoveredByCat.set(r.category, e)
  }

  // ── Rebuild catalog ───────────────────────────────────────────────────────

  const catalogReport = rebuildCatalog({ dryRun })

  // ── Post-recovery pool snapshot ───────────────────────────────────────────

  const storeAfter = dryRun ? storeBefore : getCandidatePool()
  const after = {
    inCatalog: storeAfter.candidates.filter(c => c.status === 'in_catalog').length,
    approved:  storeAfter.candidates.filter(c => c.status === 'approved').length,
    degraded:  storeAfter.candidates.filter(c => c.status === 'approved_degraded').length,
    rejected:  storeAfter.candidates.filter(c => c.status === 'rejected').length,
    exhausted: storeAfter.candidates.filter(c => c.status === 'exhausted').length,
  }

  // ── Report ────────────────────────────────────────────────────────────────

  console.log(DIVIDER)
  console.log('  GATE 7 RE-EVALUATION RESULTS')
  console.log(DIVIDER)
  console.log()
  console.log(`  Candidates reevaluated:    ${records.length}`)
  console.log(`  ├─ Recovered (ACTIVE):     ${recoveredActive}`)
  console.log(`  ├─ Recovered (DEGRADED):   ${recoveredDegraded}`)
  console.log(`  ├─ Total recovered:        ${totalRecovered}  (${pct(totalRecovered, records.length)})`)
  console.log(`  └─ Still rejected:         ${stillRejected}  (${pct(stillRejected, records.length)})`)
  console.log()
  console.log(`  Recovery rate:  ${bar(totalRecovered, records.length)}  ${pct(totalRecovered, records.length)}`)
  console.log(`  Still failed:   ${bar(stillRejected,   records.length)}  ${pct(stillRejected, records.length)}`)

  // ── Per-candidate detail (recovered) ─────────────────────────────────────

  if (totalRecovered > 0) {
    console.log()
    console.log(`  RECOVERED CANDIDATES (${totalRecovered})`)
    console.log(`  ${'ID'.padEnd(14)} ${'ASIN'.padEnd(12)} ${'Cat'.padEnd(14)} HTTP  State`)
    console.log('  ' + '─'.repeat(58))
    for (const r of records.filter(rr => rr.outcome !== 'still_rejected')) {
      const tag = r.outcome === 'recovered_active' ? '[ACTIVE]' : '[DEG]  '
      console.log(
        `  ${r.candidateId.padEnd(14)} ${r.asin.padEnd(12)} ${r.category.padEnd(14)}` +
        ` ${String(r.gate7Http ?? '?').padStart(3)}   ${tag}`
      )
    }
  }

  // ── Per-candidate detail (still rejected) ─────────────────────────────────

  if (stillRejected > 0) {
    console.log()
    console.log(`  STILL REJECTED (${stillRejected})`)
    console.log(`  ${'ID'.padEnd(14)} ${'ASIN'.padEnd(12)} HTTP  Detail`)
    console.log('  ' + '─'.repeat(60))
    for (const r of records.filter(rr => rr.outcome === 'still_rejected')) {
      console.log(
        `  ${r.candidateId.padEnd(14)} ${r.asin.padEnd(12)}` +
        ` ${String(r.gate7Http ?? 'ERR').padStart(4)}  ${(r.gate7Detail ?? '').slice(0, 46)}`
      )
    }
  }

  // ── Recovered categories ──────────────────────────────────────────────────

  if (recoveredByCat.size > 0) {
    console.log()
    console.log('  CATEGORIES RECOVERED')
    console.log(`  ${'Category'.padEnd(18)} ${'Total'.padStart(6)} ${'ACTIVE'.padStart(8)} ${'DEGRADED'.padStart(10)}`)
    console.log('  ' + '─'.repeat(44))
    for (const [cat, stats] of Array.from(recoveredByCat.entries()).sort((a, b) => b[1].total - a[1].total)) {
      console.log(
        `  ${cat.padEnd(18)}${String(stats.total).padStart(6)}${String(stats.active).padStart(8)}${String(stats.degraded).padStart(10)}`
      )
    }
  }

  // ── Pool state diff ───────────────────────────────────────────────────────

  console.log()
  console.log(DIVIDER)
  console.log('  POOL STATE CHANGE')
  console.log(DIVIDER)
  console.log(`  ${'Status'.padEnd(20)} ${'Before'.padStart(8)} ${'After'.padStart(8)} ${'Δ'.padStart(6)}`)
  console.log('  ' + '─'.repeat(44))

  const poolDiff = [
    ['in_catalog',       before.inCatalog, after.inCatalog],
    ['approved (ACTIVE)', before.approved,  after.approved],
    ['approved_degraded', before.degraded,  after.degraded],
    ['rejected',         before.rejected,  after.rejected],
    ['exhausted',        before.exhausted, after.exhausted],
  ] as [string, number, number][]

  for (const [label, b, a] of poolDiff) {
    const delta = a - b
    const sign  = delta > 0 ? '+' : delta < 0 ? '' : ' '
    console.log(
      `  ${label.padEnd(20)}${String(b).padStart(8)}${String(a).padStart(8)}  ${(sign + delta).padStart(4)}`
    )
  }

  // ── Catalog KPI ───────────────────────────────────────────────────────────

  const filledSlots  = catalogReport.slotsAssigned
  const activeSlots  = catalogReport.activeAssigned
  const degradedSlots = catalogReport.degradedAssigned
  const fillRate      = (filledSlots / MAX_SLOTS * 100).toFixed(1)
  const workingCoverage = fillRate  // same as fill rate (all filled = working)
  const fullTrustCov  = (activeSlots / MAX_SLOTS * 100).toFixed(1)

  const prevFilled    = before.inCatalog
  const prevFillRate  = (prevFilled / MAX_SLOTS * 100).toFixed(1)

  console.log()
  console.log(DIVIDER)
  console.log('  COVERAGE KPIs (post-recovery)')
  console.log(DIVIDER)
  console.log()
  console.log(`  Catalog Fill Rate`)
  console.log(`  Before: ${prevFillRate}%  (${prevFilled} / ${MAX_SLOTS})`)
  console.log(`  After:  ${fillRate}%  (${filledSlots} / ${MAX_SLOTS})  Δ = +${filledSlots - prevFilled}`)
  console.log(`  ${bar(filledSlots, MAX_SLOTS, 40)}  ${fillRate}%`)
  console.log()
  console.log(`  Working Coverage  (ACTIVE + IMAGE_DEGRADED)`)
  console.log(`  ${bar(filledSlots, MAX_SLOTS, 40)}  ${workingCoverage}%`)
  console.log()
  console.log(`  Full Trust Coverage  (ACTIVE only — verified image)`)
  console.log(`  ${bar(activeSlots, MAX_SLOTS, 40)}  ${fullTrustCov}%`)
  console.log()
  console.log(`  Slot breakdown:`)
  console.log(`  ACTIVE:         ${activeSlots.toString().padStart(4)}  (${pct(activeSlots, filledSlots)} of filled)`)
  console.log(`  IMAGE_DEGRADED: ${degradedSlots.toString().padStart(4)}  (${pct(degradedSlots, filledSlots)} of filled)`)
  console.log(`  Empty:          ${(MAX_SLOTS - filledSlots).toString().padStart(4)}`)

  // Health indicators
  const fp = parseFloat(fillRate)
  const ft = parseFloat(fullTrustCov)
  console.log()
  console.log(`  Fill Rate health:    ${fp >= 80 ? '🟢 VERDE' : fp >= 50 ? '🟡 AMARILLO' : '🔴 ROJO'} (≥80% verde, ≥50% amarillo)`)
  console.log(`  Full Trust health:   ${ft >= 50 ? '🟢 VERDE' : ft >= 20 ? '🟡 AMARILLO' : '🔴 ROJO'} (≥50% verde, ≥20% amarillo)`)

  // ── Category distribution (post-rebuild) ─────────────────────────────────

  console.log()
  console.log(DIVIDER)
  console.log('  CATALOG BY CATEGORY (post-recovery)')
  console.log(DIVIDER)
  console.log(`  ${'Category'.padEnd(16)} ${'Total'.padStart(6)} ${'ACTIVE'.padStart(8)} ${'DEGRADED'.padStart(10)} ${'Coverage'.padStart(10)}`)
  console.log('  ' + '─'.repeat(52))
  for (const cat of catalogReport.byCategory) {
    console.log(
      `  ${cat.category.padEnd(16)}` +
      `${String(cat.total).padStart(6)}` +
      `${String(cat.active).padStart(8)}` +
      `${String(cat.imageDegraded).padStart(10)}` +
      `${pct(cat.total, MAX_SLOTS, 1).padStart(10)}`,
    )
  }
  // Empty categories
  const ALL_CATS = ['electronica','gaming','hogar','cocina','deporte','oficina','belleza','mascotas','bebes','herramientas']
  const assignedCats = new Set(catalogReport.byCategory.map(c => c.category))
  for (const cat of ALL_CATS.filter(c => !assignedCats.has(c))) {
    console.log(`  ${cat.padEnd(16)}${'0'.padStart(6)}${'0'.padStart(8)}${'0'.padStart(10)}${'0.0%'.padStart(10)}`)
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const elapsed = Date.now() - scriptStart
  console.log()
  console.log(DIVIDER)
  console.log('  SPRINT 4A SUMMARY')
  console.log(DIVIDER)
  console.log()
  console.log(`  Candidates reevaluated:  ${records.length}`)
  console.log(`  Recovered:               ${totalRecovered}  (${recoveredActive} ACTIVE + ${recoveredDegraded} IMAGE_DEGRADED)`)
  console.log(`  Still rejected:          ${stillRejected}`)
  console.log(`  Categories recovered:    ${recoveredByCat.size}`)
  console.log()
  console.log(`  Fill Rate:   ${prevFillRate}% → ${fillRate}%  (+${(parseFloat(fillRate) - parseFloat(prevFillRate)).toFixed(1)}pp)`)
  console.log(`  Working Cov: ${prevFillRate}% → ${workingCoverage}%`)
  console.log(`  Full Trust:  ${fullTrustCov}%`)
  console.log()
  console.log(`  Duration:  ${elapsed}ms  (~${Math.round(elapsed / 1000)}s)`)
  if (!dryRun) {
    console.log('  Pool written:    data/tpe/candidate-pool.json')
    console.log('  Catalog rebuilt: data/tpe/trusted-catalog.json')
  }
  console.log(DIVIDER + '\n')
}

main().catch(err => {
  console.error('\n  Sprint 4A recovery failed:', err)
  process.exit(1)
})
