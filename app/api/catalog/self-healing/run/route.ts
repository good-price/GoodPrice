/**
 * POST /api/catalog/self-healing/run
 *
 * Triggers a self-healing cycle for the GOODPRICE catalog.
 * Runs the full pipeline: identify stale → archive → recover →
 * drift-repair → replacement suggestions → promote recovered →
 * refresh queue → save report.
 *
 * Auth: AUDIT_SECRET (same as other catalog admin endpoints)
 *
 * Body (all optional):
 *   {
 *     dryRun?:                  boolean  // simulate only, no writes (default: false)
 *     maxArchive?:              number   // max suppressions per cycle (default: 10)
 *     maxRecover?:              number   // max recoveries per cycle (default: 20)
 *     maxDriftRepairs?:         number   // max drift repairs (default: 20)
 *     minRecoveryScore?:        number   // min score to un-suppress (default: 60)
 *     archiveConsecutiveChecks?: number  // consecutive bad checks needed (default: 2)
 *     archiveScoreThreshold?:   number   // score threshold for archiving (default: 30)
 *     forceRun?:                boolean  // skip rate-limit check (default: false)
 *   }
 *
 * Response:
 *   {
 *     ok: boolean
 *     dryRun: boolean
 *     durationMs: number
 *     archived: HealingEvent[]
 *     recovered: HealingEvent[]
 *     driftRepairs: DriftRepair[]
 *     replacementCount: number
 *     staleCount: number
 *     report: { summary fields }
 *   }
 */

import { type NextRequest, NextResponse } from 'next/server'
import { runHealingCycle, isCycleAllowed } from '@/lib/catalog/self-healing'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 120   // 2 minutes (healing cycle is CPU/IO, not network-heavy)

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch { /* empty body is fine */ }

  const forceRun = body.forceRun === true
  const dryRun   = body.dryRun   === true

  // Rate-limit: skip if a cycle ran less than 60 min ago (unless forceRun)
  if (!forceRun && !dryRun && !isCycleAllowed()) {
    return NextResponse.json(
      { ok: false, error: 'Cycle rate-limited — use forceRun: true to override' },
      { status: 429 },
    )
  }

  const result = await runHealingCycle({
    dryRun,
    maxArchive:              typeof body.maxArchive              === 'number' ? body.maxArchive              : undefined,
    maxRecover:              typeof body.maxRecover              === 'number' ? body.maxRecover              : undefined,
    maxDriftRepairs:         typeof body.maxDriftRepairs         === 'number' ? body.maxDriftRepairs         : undefined,
    minRecoveryScore:        typeof body.minRecoveryScore        === 'number' ? body.minRecoveryScore        : undefined,
    archiveConsecutiveChecks: typeof body.archiveConsecutiveChecks === 'number' ? body.archiveConsecutiveChecks : undefined,
    archiveScoreThreshold:   typeof body.archiveScoreThreshold   === 'number' ? body.archiveScoreThreshold   : undefined,
  })

  return NextResponse.json({
    ok:               result.ok,
    dryRun:           result.dryRun,
    durationMs:       result.durationMs,
    archived:         result.archived,
    recovered:        result.recovered,
    driftRepairs:     result.driftRepairs,
    replacementCount: result.replacements.length,
    staleCount:       result.stale.length,
    report: {
      generatedAt:         result.report.generatedAt,
      cycleCount:          result.report.cycleCount,
      suppressedCount:     result.report.suppressedCount,
      recoveredAllTime:    result.report.recoveredAllTime,
      driftRepairsAllTime: result.report.driftRepairsAllTime,
      newlySuppressedCount: result.report.newlySuppressed.length,
      newlyRecoveredCount:  result.report.newlyRecovered.length,
    },
  })
}
