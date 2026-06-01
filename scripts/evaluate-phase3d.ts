/**
 * scripts/evaluate-phase3d.ts
 *
 * Phase 3D — Business Trust / Presentation Trust reclassification.
 *
 * Evaluates the 180 candidates rejected solely for image issues (Gate 8)
 * through Gate 7 (amazon_reachable) to determine business validity.
 *
 * Reclassification outcomes:
 *   Gate 7 passes → 'approved_degraded' (IMAGE_DEGRADED — valid product, broken image)
 *   Gate 7 fails  → 'rejected'           (REJECTED — business failure, dead Amazon link)
 *
 * After evaluation: reports ACTIVE / IMAGE_DEGRADED / REJECTED / RETIRED counts
 * and computes Working Coverage + Full Trust Coverage.
 *
 * Usage (from goodprice/ directory):
 *   npx tsx scripts/evaluate-phase3d.ts
 *   npx tsx scripts/evaluate-phase3d.ts --dry-run
 *   npx tsx scripts/evaluate-phase3d.ts --limit=20
 *
 * Amazon requests are serialised at 1500ms delay to avoid rate limiting.
 * Expected runtime: ~4.5 minutes for 180 candidates.
 */

import { evaluateGate7Batch } from '@/lib/tpe/admission'
import { getCandidatePool }   from '@/lib/tpe/pool'

// ── CLI args ──────────────────────────────────────────────────────────────────

const dryRun   = process.argv.includes('--dry-run')
const limitArg = process.argv.find(a => a.startsWith('--limit='))
const limit    = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined

const DIVIDER = '─'.repeat(72)

// ── Progress ──────────────────────────────────────────────────────────────────

let lastLine = ''
function progress(msg: string) {
  process.stdout.write(`\r  ${msg.padEnd(70)}`)
  lastLine = msg
}
function clearProgress() {
  if (lastLine) process.stdout.write('\r' + ' '.repeat(72) + '\r')
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

function bar(value: number, total: number, width = 28): string {
  if (total === 0) return '░'.repeat(width)
  const filled = Math.round((value / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const scriptStart = Date.now()

  // ── Pre-flight snapshot ────────────────────────────────────────────────────

  const storeBefore  = getCandidatePool()
  const before = {
    approved:         storeBefore.candidates.filter(c => c.status === 'approved').length,
    approvedDegraded: storeBefore.candidates.filter(c => c.status === 'approved_degraded').length,
    rejected:         storeBefore.candidates.filter(c => c.status === 'rejected').length,
    exhausted:        storeBefore.candidates.filter(c => c.status === 'exhausted').length,
    imageRejected:    storeBefore.candidates.filter(
      c => c.status === 'rejected' && c.rejectionGate === 'image_not_placeholder',
    ).length,
  }

  console.log('\n' + DIVIDER)
  console.log('  GOODPRICE — Trusted Product Engine v1')
  console.log('  Phase 3D: Business / Presentation Trust Reclassification')
  console.log(DIVIDER)
  console.log(`  Dry run:   ${dryRun}`)
  if (limit !== undefined) console.log(`  Limit:     ${limit}`)
  console.log()
  console.log('  PRE-FLIGHT POOL STATE')
  console.log(`  approved (ACTIVE):        ${before.approved}`)
  console.log(`  approved_degraded:        ${before.approvedDegraded}`)
  console.log(`  rejected (total):         ${before.rejected}`)
  console.log(`    of which image-only:    ${before.imageRejected}  ← Phase 3D target`)
  console.log(`  exhausted:                ${before.exhausted}`)

  if (before.imageRejected === 0) {
    console.log('\n  No image-rejected candidates found. Nothing to do.')
    console.log(DIVIDER + '\n')
    return
  }

  console.log(`\n  Target: ${before.imageRejected} candidates → Gate 7 evaluation`)
  console.log('  Amazon requests serialised at 1500ms delay')
  console.log(`  Estimated time: ~${Math.ceil(before.imageRejected * 1.5 / 60)} minutes`)
  if (dryRun) console.log('\n  [DRY RUN] Pool will NOT be modified.')
  console.log()

  // ── Run Gate 7 batch ───────────────────────────────────────────────────────

  const report = await evaluateGate7Batch({
    limit,
    dryRun,
    amazonDelayMs: 1500,
    onProgress: (done, total, lastId) => {
      if (lastId === 'done') return
      const pct = total > 0 ? Math.round((done / total) * 100) : 0
      progress(`Gate 7 evaluating... ${done}/${total} (${pct}%) — ${lastId}`)
    },
  })
  clearProgress()

  // ── Post-run pool snapshot ────────────────────────────────────────────────

  const storeAfter = getCandidatePool()
  const after = {
    approved:         storeAfter.candidates.filter(c => c.status === 'approved').length,
    approvedDegraded: storeAfter.candidates.filter(c => c.status === 'approved_degraded').length,
    rejected:         storeAfter.candidates.filter(c => c.status === 'rejected').length,
    exhausted:        storeAfter.candidates.filter(c => c.status === 'exhausted').length,
  }

  const workingTotal      = after.approved + after.approvedDegraded
  const workingCoverage   = (workingTotal / 200 * 100).toFixed(1)
  const fullTrustCoverage = (after.approved / 200 * 100).toFixed(1)

  const approvedDegradedRate = report.total > 0
    ? ((report.approvedDegraded / report.total) * 100).toFixed(1)
    : '0.0'
  const rejectedRate = report.total > 0
    ? ((report.rejected / report.total) * 100).toFixed(1)
    : '0.0'

  // ── Report ─────────────────────────────────────────────────────────────────

  console.log(DIVIDER)
  console.log(`  Run at:   ${report.runAt}`)
  console.log(`  Duration: ${report.durationMs}ms  (total script: ${Date.now() - scriptStart}ms)`)
  console.log(DIVIDER)

  console.log('\n  GATE 7 EVALUATION RESULTS')
  console.log(`  Evaluated:              ${report.total}`)
  console.log(`  → IMAGE_DEGRADED:       ${report.approvedDegraded}  (${approvedDegradedRate}%)  Business valid, image broken`)
  console.log(`  → REJECTED (Gate 7):    ${report.rejected}  (${rejectedRate}%)  Amazon link dead/unreachable`)
  console.log()
  console.log(`  IMAGE_DEGRADED rate: ${bar(report.approvedDegraded, report.total)}  ${approvedDegradedRate}%`)
  console.log(`  Rejected rate:       ${bar(report.rejected, report.total)}  ${rejectedRate}%`)

  // Per-category breakdown
  console.log('\n  BY CATEGORY — Gate 7 results')
  console.log(`  ${'Category'.padEnd(18)} ${'Total'.padStart(6)} ${'Degraded'.padStart(10)} ${'Rejected'.padStart(10)}`)
  console.log('  ' + '─'.repeat(46))
  for (const cat of report.byCategory) {
    const pct = cat.total > 0
      ? ((cat.approvedDegraded / cat.total) * 100).toFixed(0).padStart(3)
      : '  0'
    console.log(
      `  ${cat.category.padEnd(18)}` +
      `${String(cat.total).padStart(6)}` +
      `${String(cat.approvedDegraded).padStart(10)} (${pct}%)` +
      `${String(cat.rejected).padStart(8)}`,
    )
  }

  // Rejected candidates detail (new business rejections)
  const newBusinessRejections = report.records.filter(r => r.outcome === 'rejected')
  if (newBusinessRejections.length > 0) {
    console.log(`\n  REJECTED BY GATE 7 (${newBusinessRejections.length} — true business failures)`)
    for (const r of newBusinessRejections) {
      console.log(`  [REJ] ${r.candidateId.padEnd(14)} ${r.asin.padEnd(12)} HTTP=${r.gate7Http ?? '---'}`)
      if (r.gate7Detail) console.log(`        ${r.gate7Detail.slice(0, 65)}`)
    }
  }

  // ── Four-state catalog view ────────────────────────────────────────────────

  console.log('\n' + DIVIDER)
  console.log('  FOUR-STATE CATALOG VIEW (post Phase 3D)')
  console.log(DIVIDER)

  console.log('\n  ACTIVE (all 9 gates pass — real image verified)')
  console.log(`  Count:    ${after.approved}`)
  const activeIds = storeAfter.candidates
    .filter(c => c.status === 'approved')
    .map(c => `  • ${c.id.padEnd(14)} ${c.category.padEnd(14)} ${c.title.slice(0, 38)}`)
  activeIds.forEach(l => console.log(l))

  console.log('\n  IMAGE_DEGRADED (business valid — placeholder image shown)')
  console.log(`  Count:    ${after.approvedDegraded}`)
  // Per-category breakdown of IMAGE_DEGRADED
  const degMap = new Map<string, number>()
  for (const c of storeAfter.candidates.filter(c => c.status === 'approved_degraded')) {
    degMap.set(c.category, (degMap.get(c.category) ?? 0) + 1)
  }
  Array.from(degMap.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, n]) => console.log(`  ${cat.padEnd(16)}: ${n}`))

  console.log('\n  REJECTED (business gates failed — never enters catalog)')
  console.log(`  Count:    ${after.rejected}`)
  const businessRejected = storeAfter.candidates
    .filter(c => c.status === 'rejected' && c.rejectionGate !== 'image_not_placeholder')
  console.log(`  Gate failures:`)
  const rejByGate = new Map<string, number>()
  for (const c of storeAfter.candidates.filter(c => c.status === 'rejected')) {
    const g = c.rejectionGate ?? 'unknown'
    rejByGate.set(g, (rejByGate.get(g) ?? 0) + 1)
  }
  Array.from(rejByGate.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([g, n]) => console.log(`    ${g.padEnd(28)}: ${n}`))
  // Remaining image-rejected (still blocked by Gate 8)
  const stillImageRejected = storeAfter.candidates.filter(
    c => c.status === 'rejected' && c.rejectionGate === 'image_not_placeholder'
  ).length
  if (stillImageRejected > 0) {
    console.log(`\n  NOTE: ${stillImageRejected} still rejected at image_not_placeholder`)
    console.log('  (These passed Gate 7 business check but image is still broken.)')
    console.log('  They are IMAGE_DEGRADED — they appear in the count above.')
  }

  console.log('\n  RETIRED')
  console.log('  Count:    0  (no product has been in catalog yet — N/A for this phase)')

  // ── Coverage KPIs ──────────────────────────────────────────────────────────

  console.log('\n' + DIVIDER)
  console.log('  COVERAGE KPIs')
  console.log(DIVIDER)
  console.log()
  console.log(`  Working Coverage   (ACTIVE + IMAGE_DEGRADED) / 200 slots`)
  console.log(`  = ${workingTotal} / 200 = ${workingCoverage}%`)
  console.log(`  ${bar(workingTotal, 200, 40)}  ${workingCoverage}%`)
  console.log()
  console.log(`  Full Trust Coverage (ACTIVE only) / 200 slots`)
  console.log(`  = ${after.approved} / 200 = ${fullTrustCoverage}%`)
  console.log(`  ${bar(after.approved, 200, 40)}  ${fullTrustCoverage}%`)
  console.log()
  console.log('  Health indicators:')
  const workingPct = parseFloat(workingCoverage)
  const fullPct    = parseFloat(fullTrustCoverage)
  console.log(`  Working Coverage:    ${workingPct >= 80 ? '🟢 VERDE' : workingPct >= 40 ? '🟡 AMARILLO' : '🔴 ROJO'} (≥80% verde, ≥40% amarillo)`)
  console.log(`  Full Trust:          ${fullPct >= 50 ? '🟢 VERDE' : fullPct >= 20 ? '🟡 AMARILLO' : '🔴 ROJO'} (≥50% verde, ≥20% amarillo)`)
  console.log()

  // ── Pool state diff ────────────────────────────────────────────────────────

  console.log('  POOL STATE CHANGE')
  console.log(`  approved (ACTIVE):    ${before.approved} → ${after.approved}  (no change)`)
  console.log(`  approved_degraded:    ${before.approvedDegraded} → ${after.approvedDegraded}  (+${after.approvedDegraded - before.approvedDegraded})`)
  console.log(`  rejected:             ${before.rejected} → ${after.rejected}  (${after.rejected - before.rejected >= 0 ? '+' : ''}${after.rejected - before.rejected})`)
  console.log(`  exhausted:            ${before.exhausted} → ${after.exhausted}`)

  console.log('\n' + DIVIDER)
  console.log(`  Phase 3D complete.`)
  console.log(`  ${workingTotal} candidates ready for catalog slot assignment (Phase 4).`)
  console.log(`  Working Coverage: ${workingCoverage}% — Full Trust: ${fullTrustCoverage}%`)
  if (!dryRun) console.log('  Pool written to data/tpe/candidate-pool.json.')
  console.log(DIVIDER + '\n')
}

main().catch(err => {
  console.error('\n  Phase 3D failed:', err)
  process.exit(1)
})
