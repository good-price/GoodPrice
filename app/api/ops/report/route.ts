/**
 * GET /api/ops/report
 *
 * Returns a fresh unified operational report for the GOODPRICE platform.
 * Includes: health score, alerts, anomalies, queue status, diagnostics,
 * and recent activity timeline.
 *
 * Auth: AUDIT_SECRET
 *
 * Optional query params:
 *   ?save=1       — persist the report to disk (data/ops/ops-report.json)
 *   ?cached=1     — return the last persisted report instead of rebuilding
 */

import { type NextRequest, NextResponse } from 'next/server'
import { buildOpsReport, loadOpsReport, saveOpsReport } from '@/lib/ops'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const useCached = req.nextUrl.searchParams.get('cached') === '1'
  const doSave    = req.nextUrl.searchParams.get('save')   === '1'

  const report = useCached ? (loadOpsReport() ?? buildOpsReport()) : buildOpsReport()

  if (doSave && !useCached) {
    saveOpsReport(report)
  }

  return NextResponse.json(
    { ok: true, report },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
