/**
 * scripts/evaluate-http.ts
 *
 * Runs HTTP gate evaluation (Gates 8, 9, 7) against all candidates that
 * passed local gates (Phase 3A). Writes results to candidate-pool.json.
 *
 * Usage (from goodprice/ directory):
 *   npx tsx scripts/evaluate-http.ts
 *   npx tsx scripts/evaluate-http.ts --dry-run
 *   npx tsx scripts/evaluate-http.ts --limit 10
 *
 * NOTE: This script makes real HTTP requests to Amazon CDN and amazon.com.
 * Amazon requests are serialised with a 1500ms delay between each to
 * avoid triggering rate limiting.
 *
 * Expected runtime: depends on how many candidates survive Gate 8.
 * With the legacy catalog (images-na URLs), most candidates fail Gate 8
 * locally (no HTTP) and only a few reach Gates 9 and 7.
 */

import { evaluateHttpBatch } from '@/lib/tpe/admission'
import { getCandidatePool }  from '@/lib/tpe/pool'
import type { GateId }       from '@/types'

// ── CLI args ──────────────────────────────────────────────────────────────────
const dryRun  = process.argv.includes('--dry-run')
const limitArg = process.argv.find(a => a.startsWith('--limit='))
const limit    = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined

// ── Gate labels ───────────────────────────────────────────────────────────────
const GATE_LABELS: Record<GateId, string> = {
  asin_format:           'Gate 1 — asin_format           (local)',
  data_complete:         'Gate 2 — data_complete          (local)',
  price_valid:           'Gate 3 — price_valid            (local)',
  colombia_unrestricted: 'Gate 4 — colombia_unrestricted  (local)',
  colombia_confirmed:    'Gate 5 — colombia_confirmed     (local)',
  status_active:         'Gate 6 — status_active          (local)',
  amazon_reachable:      'Gate 7 — amazon_reachable       (HTTP)',
  image_not_placeholder: 'Gate 8 — image_not_placeholder  (local)',
  image_accessible:      'Gate 9 — image_accessible       (HTTP)',
  validation_fresh:      'Gate 10— validation_fresh       (revalidation)',
}

const DIVIDER = '─'.repeat(72)

function bar(value: number, total: number, width = 30): string {
  if (total === 0) return '░'.repeat(width)
  const filled = Math.round((value / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

// ── Progress callback ─────────────────────────────────────────────────────────
let lastProgressLine = ''
function onProgress(done: number, total: number, lastId: string) {
  if (lastId === 'done') return
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const line = `  Evaluating... ${done}/${total} (${pct}%) — last: ${lastId}`.padEnd(72)
  process.stdout.write('\r' + line)
  lastProgressLine = line
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const pool = getCandidatePool()
  const pendingCount = pool.candidates.filter(
    c => c.status === 'pending' && c.lastBundle && c.lastBundle.gates.length === 6,
  ).length

  console.log('\n' + DIVIDER)
  console.log('  GOODPRICE — Trusted Product Engine v1')
  console.log('  HTTP Gate Evaluation Report (Gates 8, 9, 7)')
  console.log(DIVIDER)
  console.log(`  Pool size:           ${pool.candidates.length} total candidates`)
  console.log(`  Eligible (pending):  ${pendingCount}`)
  console.log(`  Dry run:             ${dryRun}`)
  if (limit !== undefined) console.log(`  Limit:               ${limit}`)
  console.log()

  if (pendingCount === 0) {
    console.log('  No pending candidates found — nothing to evaluate.')
    console.log('  Run scripts/migrate-to-pool.ts and scripts/evaluate-local.ts first.')
    console.log(DIVIDER + '\n')
    process.exit(0)
  }

  if (dryRun) {
    console.log('  [DRY RUN] Pool will NOT be modified.\n')
  }

  console.log('  Note: Amazon requests are serialised (1500ms delay) to avoid rate limits.')
  console.log('  Most candidates fail Gate 8 locally — only image-CDN-valid candidates')
  console.log('  reach Gates 9 and 7.')
  console.log()

  // ── Run evaluation ─────────────────────────────────────────────────────────
  const report = await evaluateHttpBatch({
    limit,
    dryRun,
    amazonDelayMs: 1500,
    onProgress,
  })

  // Clear progress line
  if (lastProgressLine) {
    process.stdout.write('\r' + ' '.repeat(72) + '\r')
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const approveRate = report.total > 0
    ? ((report.approved / report.total) * 100).toFixed(1)
    : '0.0'
  const rejectRate = report.total > 0
    ? (((report.rejected + report.exhausted) / report.total) * 100).toFixed(1)
    : '0.0'

  console.log(DIVIDER)
  console.log(`  Run at:   ${report.runAt}`)
  console.log(`  Duration: ${report.durationMs}ms`)
  console.log(DIVIDER)

  console.log('\n  SUMMARY — HTTP EVALUATION')
  console.log(`  Candidates evaluated:  ${report.total}`)
  console.log(`  Approved (allPassed):  ${report.approved}  (${approveRate}%)`)
  console.log(`  Rejected:              ${report.rejected}`)
  console.log(`  Exhausted (>=3 fails): ${report.exhausted}`)
  console.log()
  console.log(`  Approve rate:  ${bar(report.approved,  report.total)}  ${approveRate}%`)
  console.log(`  Reject rate:   ${bar(report.rejected + report.exhausted, report.total)}  ${rejectRate}%`)

  // ── Rejection reasons ──────────────────────────────────────────────────────
  console.log('\n  REJECTION REASONS (by gate)')
  if (report.topRejectionReasons.length === 0) {
    console.log('  None — all candidates approved.')
  } else {
    for (const r of report.topRejectionReasons) {
      const label = GATE_LABELS[r.gate] ?? r.gate
      console.log(`\n  ${label}  x${r.count}`)
      if (r.sampleDetail) {
        console.log(`    Sample: ${r.sampleDetail.slice(0, 90)}`)
      }
    }
  }

  // ── Per-category breakdown ─────────────────────────────────────────────────
  console.log('\n  BY CATEGORY (HTTP evaluation)')
  console.log(`  ${'Category'.padEnd(18)} ${'Total'.padStart(6)} ${'Approved'.padStart(10)} ${'Rejected'.padStart(10)}`)
  console.log('  ' + '─'.repeat(46))
  for (const cat of report.byCategory) {
    const pct = cat.total > 0
      ? ((cat.approved / cat.total) * 100).toFixed(0).padStart(3)
      : '  0'
    console.log(
      `  ${cat.category.padEnd(18)}` +
      `${String(cat.total).padStart(6)}` +
      `${String(cat.approved).padStart(10)} (${pct}%)` +
      `${String(cat.rejected).padStart(8)}`,
    )
  }

  // ── Approved candidates ────────────────────────────────────────────────────
  const approvedRecords = report.records.filter(r => r.outcome === 'approved_active' || r.outcome === 'approved_degraded')
  if (approvedRecords.length > 0) {
    console.log('\n  APPROVED CANDIDATES (ready for catalog slots)')
    for (const r of approvedRecords) {
      console.log(`  [OK] ${r.candidateId.padEnd(14)} ${r.category.padEnd(14)} ${r.title.slice(0, 45)}`)
    }
  } else {
    console.log('\n  No candidates approved in this run.')
  }

  // ── Rejected candidates detail ─────────────────────────────────────────────
  const failedRecords = report.records.filter(r => r.outcome !== 'approved_active' && r.outcome !== 'approved_degraded')
  if (failedRecords.length > 0 && failedRecords.length <= 20) {
    console.log('\n  REJECTED CANDIDATES (detail)')
    for (const r of failedRecords) {
      const status = r.outcome === 'exhausted' ? '[EXHAUSTED]' : '[REJECTED] '
      const gate = r.failedGate ? (GATE_LABELS[r.failedGate] ?? r.failedGate) : 'unknown'
      console.log(`  ${status} ${r.candidateId.padEnd(14)} ${gate}`)
      if (r.failDetail) {
        console.log(`               ${r.failDetail.slice(0, 75)}`)
      }
    }
  } else if (failedRecords.length > 20) {
    console.log(`\n  ${failedRecords.length} rejected — showing top 10 by gate:`)
    for (const r of failedRecords.slice(0, 10)) {
      const gate = r.failedGate ? GATE_LABELS[r.failedGate]?.slice(0, 40) ?? r.failedGate : 'unknown'
      console.log(`  [REJ] ${r.candidateId.padEnd(14)} ${gate}`)
    }
    console.log(`  ... and ${failedRecords.length - 10} more`)
  }

  // ── Cumulative pool state ──────────────────────────────────────────────────
  if (!dryRun) {
    const updatedPool = getCandidatePool()
    const byStatus = new Map<string, number>()
    for (const c of updatedPool.candidates) {
      byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1)
    }
    console.log('\n  CUMULATIVE POOL STATE (after this run)')
    for (const [status, count] of Array.from(byStatus.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${status.padEnd(14)}: ${count}`)
    }
  }

  // ── Actionable insights ────────────────────────────────────────────────────
  const gate8Failures = report.topRejectionReasons.find(r => r.gate === 'image_not_placeholder')
  if (gate8Failures && gate8Failures.count > 0) {
    console.log('\n  ACTION REQUIRED')
    console.log(`  ${gate8Failures.count} candidates have deprecated images-na CDN URLs.`)
    console.log('  These products need image URL updates (PA-API sync or manual CDN swap)')
    console.log('  to m.media-amazon.com before they can enter the Trusted Catalog.')
  }

  // ── Next steps ─────────────────────────────────────────────────────────────
  console.log('\n' + DIVIDER)
  if (report.approved > 0) {
    console.log(`  ${report.approved} candidate(s) are now APPROVED and ready for slot promotion.`)
    console.log('  Next: implement Fase 4 (lib/tpe/catalog.ts) to promote approved')
    console.log('  candidates into the Trusted Catalog slots.')
  } else {
    console.log('  0 candidates approved. The Trusted Catalog remains empty.')
    console.log('  Image URL remediation is required for the legacy catalog.')
  }
  if (!dryRun) console.log(`  Pool written to data/tpe/candidate-pool.json.`)
  console.log(DIVIDER + '\n')
}

main().catch(err => {
  console.error('\n  Evaluation failed:', err)
  process.exit(1)
})
