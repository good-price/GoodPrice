/**
 * GET /api/catalog/self-healing/report
 *
 * Returns the latest self-healing report.
 * Returns 204 (no content) when no healing cycle has run yet.
 *
 * Auth: AUDIT_SECRET
 *
 * Optional query params:
 *   ?includeReplacements=1   — include full replacement suggestions (default: false)
 *   ?includeStale=1          — include stale product list (default: false)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { loadHealingReport } from '@/lib/catalog/self-healing'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const report = loadHealingReport()

  if (!report) {
    return new NextResponse(null, { status: 204 })
  }

  const includeReplacements = req.nextUrl.searchParams.get('includeReplacements') === '1'
  const includeStale        = req.nextUrl.searchParams.get('includeStale')        === '1'

  return NextResponse.json({
    ok: true,
    report: {
      generatedAt:          report.generatedAt,
      cycleCount:           report.cycleCount,
      lastCycleAt:          report.lastCycleAt,
      suppressedCount:      report.suppressedCount,
      recoveredAllTime:     report.recoveredAllTime,
      driftRepairsAllTime:  report.driftRepairsAllTime,
      newlySuppressed:      report.newlySuppressed,
      newlyRecovered:       report.newlyRecovered,
      driftRepairs:         report.driftRepairs,
      replacements:         includeReplacements ? report.replacements : undefined,
      replacementCount:     report.replacements.length,
      staleProducts:        includeStale ? report.staleProducts : undefined,
      staleCount:           report.staleProducts.length,
    },
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
