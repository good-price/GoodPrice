/**
 * scripts/evaluate-local.ts
 *
 * Runs the local gate evaluation (gates 1–6) against all pending candidates
 * in data/tpe/candidate-pool.json and prints a detailed report.
 *
 * Usage (from goodprice/ directory):
 *   npx tsx scripts/evaluate-local.ts
 *   npx tsx scripts/evaluate-local.ts --dry-run   (compute only, no pool write)
 *
 * Idempotent: only 'pending' candidates are evaluated. Already-evaluated
 * candidates (rejected / exhausted / in_catalog) are left unchanged.
 */

import { evaluateLocalBatch } from '@/lib/tpe/admission'
import type { GateId } from '@/types'

const DIVIDER = '─'.repeat(72)

const GATE_LABELS: Record<GateId, string> = {
  asin_format:           'Gate 1 — asin_format',
  data_complete:         'Gate 2 — data_complete',
  price_valid:           'Gate 3 — price_valid',
  colombia_unrestricted: 'Gate 4 — colombia_unrestricted',
  colombia_confirmed:    'Gate 5 — colombia_confirmed',
  status_active:         'Gate 6 — status_active',
  amazon_reachable:      'Gate 7 — amazon_reachable',
  image_not_placeholder: 'Gate 8 — image_not_placeholder',
  image_accessible:      'Gate 9 — image_accessible',
  validation_fresh:      'Gate 10 — validation_fresh',
}

function bar(value: number, total: number, width = 30): string {
  if (total === 0) return '░'.repeat(width)
  const filled = Math.round((value / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  if (dryRun) {
    console.log('\n  [DRY RUN] Pool will NOT be modified.\n')
  }

  const report = evaluateLocalBatch({ dryRun })

  const passRate = report.total > 0
    ? ((report.passedLocalGates / report.total) * 100).toFixed(1)
    : '0.0'
  const rejectRate = report.total > 0
    ? (((report.rejected + report.exhausted) / report.total) * 100).toFixed(1)
    : '0.0'

  console.log('\n' + DIVIDER)
  console.log('  GOODPRICE — Trusted Product Engine v1')
  console.log('  Local Gate Evaluation Report (Gates 1–6)')
  console.log(DIVIDER)
  console.log(`  Run at:   ${report.runAt}`)
  console.log(`  Duration: ${report.durationMs}ms`)
  console.log(`  Dry run:  ${dryRun}`)
  console.log(DIVIDER)

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n  SUMMARY')
  console.log(`  Candidates evaluated:    ${report.total}`)
  console.log(`  Passed local gates:      ${report.passedLocalGates}  (${passRate}%)`)
  console.log(`  Rejected:                ${report.rejected}`)
  console.log(`  Exhausted (≥3 fails):    ${report.exhausted}`)
  console.log()
  console.log(`  Pass rate:    ${bar(report.passedLocalGates, report.total)}  ${passRate}%`)
  console.log(`  Reject rate:  ${bar(report.rejected + report.exhausted, report.total)}  ${rejectRate}%`)

  // ── Top rejection reasons ──────────────────────────────────────────────────
  console.log('\n  REJECTION REASONS (by gate)')
  if (report.topRejectionReasons.length === 0) {
    console.log('  None — all candidates passed local gates.')
  } else {
    for (const reason of report.topRejectionReasons) {
      const label = GATE_LABELS[reason.gate] ?? reason.gate
      console.log(`\n  ${label}  ×${reason.count}`)
      console.log(`    Sample: ${reason.sampleDetail.slice(0, 90)}`)
    }
  }

  // ── Per-category breakdown ─────────────────────────────────────────────────
  console.log('\n  BY CATEGORY')
  console.log(`  ${'Category'.padEnd(18)} ${'Total'.padStart(6)} ${'Passed'.padStart(8)} ${'Rejected'.padStart(10)}`)
  console.log('  ' + '─'.repeat(44))
  for (const cat of report.byCategory) {
    const pct = cat.total > 0
      ? ((cat.passedLocalGates / cat.total) * 100).toFixed(0).padStart(3)
      : '  0'
    console.log(
      `  ${cat.category.padEnd(18)}` +
      `${String(cat.total).padStart(6)}` +
      `${String(cat.passedLocalGates).padStart(8)} (${pct}%)` +
      `${String(cat.rejected).padStart(8)}`,
    )
  }

  // ── Rejected candidates detail ────────────────────────────────────────────
  const failedRecords = report.records.filter(r => r.outcome !== 'passed_local')
  if (failedRecords.length > 0) {
    console.log('\n  REJECTED CANDIDATES')
    for (const r of failedRecords) {
      const status = r.outcome === 'exhausted' ? '[EXHAUSTED]' : '[REJECTED] '
      const gate = r.failedGate ? GATE_LABELS[r.failedGate] ?? r.failedGate : 'unknown'
      console.log(`  ${status} ${r.candidateId.padEnd(12)} ${gate}`)
      if (r.failDetail) {
        console.log(`             ${r.failDetail.slice(0, 80)}`)
      }
    }
  }

  // ── Next steps ─────────────────────────────────────────────────────────────
  console.log('\n' + DIVIDER)
  if (report.passedLocalGates > 0) {
    console.log(`  ${report.passedLocalGates} candidates passed all local gates and are ready`)
    console.log('  for HTTP gate evaluation (Phase 3B: amazon_reachable, image_accessible).')
  }
  if (!dryRun && report.total > 0) {
    console.log(`  Pool updated: ${report.total} candidates evaluated and saved.`)
  }
  console.log(DIVIDER + '\n')
}

main().catch(err => {
  console.error('\n  Evaluation failed:', err)
  process.exit(1)
})
