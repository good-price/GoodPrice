/**
 * GET /api/catalog/repair/report
 *
 * Returns the current repair report for the admin dashboard.
 *
 * Does NOT trigger a repair run — reads live catalog state and history files.
 *
 * Auth: protected by AUDIT_SECRET env var (Bearer token or ?secret= query param).
 * If AUDIT_SECRET is not set, the endpoint is open (dev convenience).
 *
 * Returns:
 *   RepairReport with:
 *   - totalProducts, productsNeedingRepair, repairedAllTime
 *   - pendingManualReview, needsPaapi, successRate
 *   - byCategory: per-category repair stats
 *   - recentReplacements: last 20 replacement entries
 *   - openFailures: products that couldn't be repaired
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRepairReport } from '@/lib/catalog/repair'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = getRepairReport(null)

    const hasIssues = report.productsNeedingRepair > 0

    return NextResponse.json(
      { ok: true, ...report },
      { status: hasIssues ? 207 : 200 },
    )
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    )
  }
}
