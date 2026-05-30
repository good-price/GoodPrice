/**
 * GET /api/audit/report
 * GET /api/audit/report?runId=audit-1234567890-abc123
 *
 * Returns the latest audit report (or a specific one by runId).
 * Also returns the list of available report run IDs.
 *
 * No auth required — reports contain internal data but no secrets.
 * Protect at the infrastructure level (Vercel auth, middleware) if needed.
 *
 * Response:
 * {
 *   availableRuns: string[]
 *   report: CatalogAuditReport | null
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { loadLatestReport, loadReport, listReports } from '@/lib/audit/report'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get('runId')

  const availableRuns = listReports()

  const report = runId
    ? loadReport(runId)
    : loadLatestReport()

  if (runId && !report) {
    return NextResponse.json(
      { error: `Report not found: ${runId}` },
      { status: 404 }
    )
  }

  return NextResponse.json({ availableRuns, report })
}
