/**
 * scripts/recover-images-tier1.ts
 *
 * Image Recovery Engine — Tier 1 (CDN Swap)
 *
 * Recovers candidates rejected at Gate 8 (image_not_placeholder) that use
 * the deprecated images-na.ssl-images-amazon.com/images/I/ CDN format.
 * Swaps the hostname to m.media-amazon.com and verifies via HTTP.
 *
 * After recovery: automatically re-runs Gates 8, 9, and 7 on all verified
 * candidates to determine which ones reach 'approved' status.
 *
 * Usage (from goodprice/ directory):
 *   npx tsx scripts/recover-images-tier1.ts
 *   npx tsx scripts/recover-images-tier1.ts --dry-run
 *   npx tsx scripts/recover-images-tier1.ts --concurrency=10
 *
 * Concurrency applies only to the CDN verification phase (image HEAD requests).
 * Amazon Gate 7 requests remain serialised with a 1500ms delay.
 */

import { getCandidatePool, saveCandidatePool } from '@/lib/tpe/pool'
import { recoverLegacyImage }                  from '@/lib/tpe/recovery/image-recovery'
import { isLegacyICdnUrl }                     from '@/lib/tpe/recovery/image-swap'
import { evaluateHttpBatch }                   from '@/lib/tpe/admission'
import type { CandidateRecord }                from '@/types'
import type { CandidateRecoveryResult, Tier1RecoveryReport } from '@/lib/tpe/recovery/recovery-types'

// ── CLI args ──────────────────────────────────────────────────────────────────

const dryRun = process.argv.includes('--dry-run')
const concArg = process.argv.find(a => a.startsWith('--concurrency='))
const concurrency = concArg ? parseInt(concArg.split('=')[1], 10) : 8

const DIVIDER = '─'.repeat(72)

// ── Progress helpers ──────────────────────────────────────────────────────────

function clearLine() { process.stdout.write('\r' + ' '.repeat(72) + '\r') }
function progress(msg: string) { process.stdout.write(`\r  ${msg.padEnd(70)}`) }

// ── Batch concurrency helper ──────────────────────────────────────────────────

async function runWithConcurrency<T, R>(
  items:   T[],
  fn:      (item: T, index: number) => Promise<R>,
  limit:   number,
  onItem?: (done: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  let done = 0

  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
      done++
      onItem?.(done, items.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const scriptStart = Date.now()

  console.log('\n' + DIVIDER)
  console.log('  GOODPRICE — Trusted Product Engine v1')
  console.log('  Image Recovery Engine — Tier 1 (CDN Swap)')
  console.log(DIVIDER)
  console.log(`  Dry run:     ${dryRun}`)
  console.log(`  Concurrency: ${concurrency} (image verification phase)`)

  // ── 1. Find Gate 8 failures with /I/ format ───────────────────────────────

  const store = getCandidatePool()
  const tier1Candidates = store.candidates.filter(
    c =>
      c.rejectionGate === 'image_not_placeholder' &&
      isLegacyICdnUrl(c.image),
  )

  console.log(`\n  Candidates eligible for Tier 1 recovery: ${tier1Candidates.length}`)
  console.log(`  (images-na.ssl-images-amazon.com /images/I/ format)\n`)

  if (tier1Candidates.length === 0) {
    console.log('  Nothing to recover. Exiting.')
    console.log(DIVIDER + '\n')
    return
  }

  if (dryRun) console.log('  [DRY RUN] Pool will NOT be modified.\n')

  // ── 2. Recovery phase (concurrent image HEAD verification) ─────────────────

  console.log('  Phase 1: CDN swap + HTTP verification')

  const recoveryResults: CandidateRecoveryResult[] = []
  const updatedCandidates: CandidateRecord[] = []

  const recoverStart = Date.now()

  await runWithConcurrency(
    tier1Candidates,
    async (candidate, _i) => {
      const outcome = await recoverLegacyImage(candidate)
      const result: CandidateRecoveryResult = {
        candidateId:   candidate.id,
        asin:          candidate.asin,
        title:         candidate.title,
        category:      candidate.category,
        originalImage: candidate.image,
        confidence:    outcome.confidence,
        verifiedUrl:   outcome.attempt.verifiedUrl,
        attempt:       outcome.attempt,
      }
      recoveryResults.push(result)
      if (outcome.updatedCandidate) {
        updatedCandidates.push(outcome.updatedCandidate)
      }
    },
    concurrency,
    (done, total) => progress(`Verifying CDN swap... ${done}/${total} (${Math.round(done/total*100)}%)`),
  )

  clearLine()

  const verified   = recoveryResults.filter(r => r.confidence === 'verified')
  const broken     = recoveryResults.filter(r => r.confidence === 'broken')
  const recoverMs  = Date.now() - recoverStart

  console.log(`  Done in ${recoverMs}ms`)
  console.log(`  Verified: ${verified.length}  |  Broken: ${broken.length}`)

  // ── 3. Write verified candidates to pool ──────────────────────────────────

  let poolBeforeApproved = store.candidates.filter(c => c.status === 'approved').length

  if (!dryRun && updatedCandidates.length > 0) {
    const updatedById = new Map(updatedCandidates.map(c => [c.id, c]))
    const newCandidates = store.candidates.map(c =>
      updatedById.has(c.id) ? updatedById.get(c.id)! : c,
    )
    saveCandidatePool({ ...store, candidates: newCandidates })
    console.log(`  Pool updated: ${updatedCandidates.length} candidates set to pending`)
  }

  // ── 4. Re-evaluation phase (Gates 8 → 9 → 7) ─────────────────────────────

  let reEvalApproved  = 0
  let reEvalRejected  = 0
  let reEvalDurationMs = 0
  const newlyApproved: { candidateId: string; category: string; title: string }[] = []
  const gateFailCounts = new Map<string, number>()

  if (!dryRun && verified.length > 0) {
    console.log(`\n  Phase 2: Re-evaluating ${verified.length} recovered candidates`)
    console.log('  (Gates 8 → 9 → 7, Amazon requests serialised at 1500ms)')
    console.log()

    let lastProgressLine = ''

    const reEvalReport = await evaluateHttpBatch({
      amazonDelayMs: 1500,
      onProgress: (done, total, lastId) => {
        if (lastId === 'done') return
        const pct = total > 0 ? Math.round((done / total) * 100) : 0
        const line = `Re-evaluating... ${done}/${total} (${pct}%) — ${lastId}`
        process.stdout.write(`\r  ${line.padEnd(70)}`)
        lastProgressLine = line
      },
    })

    if (lastProgressLine) clearLine()

    reEvalApproved   = reEvalReport.approved
    reEvalRejected   = reEvalReport.rejected + reEvalReport.exhausted
    reEvalDurationMs = reEvalReport.durationMs

    for (const r of reEvalReport.records) {
      if (r.outcome === 'approved_active' || r.outcome === 'approved_degraded') {
        newlyApproved.push({ candidateId: r.candidateId, category: r.category, title: r.title })
      }
    }
    for (const reason of reEvalReport.topRejectionReasons) {
      gateFailCounts.set(reason.gate, reason.count)
    }

    console.log(`  Re-evaluation complete in ${reEvalDurationMs}ms`)
  }

  // ── 5. Build per-category breakdown ───────────────────────────────────────

  const catMap = new Map<string, { total: number; verified: number; broken: number }>()
  for (const r of recoveryResults) {
    const e = catMap.get(r.category) ?? { total: 0, verified: 0, broken: 0 }
    e.total++
    if (r.confidence === 'verified') e.verified++
    else e.broken++
    catMap.set(r.category, e)
  }
  const byCategory = Array.from(catMap.entries())
    .map(([category, s]) => ({ category, ...s }))
    .sort((a, b) => b.total - a.total)

  // ── 6. Final pool state ────────────────────────────────────────────────────

  const finalPool = getCandidatePool()
  const finalApproved = finalPool.candidates.filter(c => c.status === 'approved').length
  const finalRejected = finalPool.candidates.filter(c => c.status === 'rejected').length
  const finalPending  = finalPool.candidates.filter(c => c.status === 'pending').length

  // ── 7. Report ──────────────────────────────────────────────────────────────

  const totalMs = Date.now() - scriptStart
  const verifyRate = tier1Candidates.length > 0
    ? ((verified.length / tier1Candidates.length) * 100).toFixed(1)
    : '0.0'

  console.log('\n' + DIVIDER)
  console.log('  RECOVERY REPORT — TIER 1 (CDN Swap)')
  console.log(DIVIDER)
  console.log(`  Total runtime:          ${totalMs}ms`)
  console.log(`  Recovery phase:         ${recoverMs}ms`)
  if (!dryRun && verified.length > 0) {
    console.log(`  Re-evaluation phase:    ${reEvalDurationMs}ms`)
  }

  console.log('\n  PHASE 1 — CDN VERIFICATION')
  console.log(`  Candidates evaluated:   ${tier1Candidates.length}`)
  console.log(`  Verified (HTTP 200):    ${verified.length}  (${verifyRate}%)`)
  console.log(`  Broken (404/timeout):   ${broken.length}`)

  if (!dryRun) {
    console.log('\n  PHASE 2 — GATE RE-EVALUATION (8 → 9 → 7)')
    console.log(`  Candidates re-evaluated: ${verified.length}`)
    console.log(`  Newly approved:          ${reEvalApproved}`)
    console.log(`  Re-rejected:             ${reEvalRejected}`)
  }

  // Category breakdown
  console.log('\n  BY CATEGORY')
  console.log(`  ${'Category'.padEnd(18)} ${'Eligible'.padStart(9)} ${'Verified'.padStart(10)} ${'Broken'.padStart(8)}`)
  console.log('  ' + '─'.repeat(47))
  for (const cat of byCategory) {
    const pct = cat.total > 0
      ? ((cat.verified / cat.total) * 100).toFixed(0).padStart(3)
      : '  0'
    console.log(
      `  ${cat.category.padEnd(18)}` +
      `${String(cat.total).padStart(9)}` +
      `${String(cat.verified).padStart(10)} (${pct}%)` +
      `${String(cat.broken).padStart(6)}`,
    )
  }

  // Newly approved
  if (newlyApproved.length > 0) {
    console.log('\n  NEWLY APPROVED CANDIDATES')
    for (const a of newlyApproved) {
      console.log(`  [OK] ${a.candidateId.padEnd(14)} ${a.category.padEnd(14)} ${a.title.slice(0, 40)}`)
    }
  }

  // Re-rejected gate breakdown
  if (gateFailCounts.size > 0) {
    console.log('\n  RE-EVALUATION REJECTION REASONS')
    for (const [gate, count] of Array.from(gateFailCounts.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${gate.padEnd(28)} x${count}`)
    }
  }

  // Broken recovery detail (first 10)
  if (broken.length > 0) {
    console.log(`\n  BROKEN (CDN swap failed) — ${broken.length} candidates`)
    for (const r of broken.slice(0, 10)) {
      console.log(`  [BROKEN] ${r.candidateId.padEnd(14)} ${r.attempt.detail?.slice(0, 55) ?? ''}`)
    }
    if (broken.length > 10) console.log(`  ... and ${broken.length - 10} more`)
  }

  // Final pool state
  console.log('\n  FINAL POOL STATE')
  console.log(`  approved : ${finalApproved}  (was ${poolBeforeApproved})`)
  console.log(`  rejected : ${finalRejected}`)
  console.log(`  pending  : ${finalPending}`)

  console.log('\n' + DIVIDER)
  if (!dryRun) {
    console.log(`  Recovery complete. ${reEvalApproved} new approved candidates.`)
    console.log(`  Total approved pool: ${finalApproved} candidates.`)
    if (finalPending > 0) {
      console.log(`  ${finalPending} candidates remain pending (awaiting further evaluation).`)
    }
  } else {
    console.log(`  Dry run complete. ${verified.length} candidates would have been recovered.`)
  }
  console.log(DIVIDER + '\n')
}

main().catch(err => {
  console.error('\n  Recovery failed:', err)
  process.exit(1)
})
