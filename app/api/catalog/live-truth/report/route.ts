/**
 * GET /api/catalog/live-truth/report
 *
 * Returns the latest live truth report.
 * Returns 204 (no content) when no validation has been run yet.
 *
 * Auth: AUDIT_SECRET
 *
 * Optional query params:
 *   ?includeResults=1   — include full per-product results (default: false)
 *   ?status=drifted     — filter results to a specific status
 */

import { type NextRequest, NextResponse } from 'next/server'
import { loadReport } from '@/lib/catalog/live-truth'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const report = loadReport()

  if (!report) {
    return new NextResponse(null, { status: 204 })
  }

  const includeResults = req.nextUrl.searchParams.get('includeResults') === '1'
  const statusFilter   = req.nextUrl.searchParams.get('status')

  let results = report.results
  if (statusFilter) {
    results = Object.fromEntries(
      Object.entries(results).filter(([, r]) => r.status === statusFilter),
    )
  }

  return NextResponse.json({
    ok:         true,
    report: {
      generatedAt:               report.generatedAt,
      totalChecked:              report.totalChecked,
      totalInCatalog:            report.totalInCatalog,
      validCount:                report.validCount,
      driftedCount:              report.driftedCount,
      unavailableCount:          report.unavailableCount,
      suspectCount:              report.suspectCount,
      failedCount:               report.failedCount,
      fakeDiscountCount:         report.fakeDiscountCount,
      titleDriftCount:           report.titleDriftCount,
      imageDriftCount:           report.imageDriftCount,
      avgTruthScore:             report.avgTruthScore,
      lowScoreCount:             report.lowScoreCount,
      quarantineRecommendations: report.quarantineRecommendations,
      results:                   includeResults ? results : undefined,
    },
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
