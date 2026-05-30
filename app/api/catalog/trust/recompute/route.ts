/**
 * POST /api/catalog/trust/recompute
 *
 * Forces a fresh TrustReport computation from the current catalog state,
 * persists it to data/catalog/trust/trust-report.json, and returns the result.
 *
 * Also invalidates the visibility engine context cache so the next public
 * request picks up any changes to quarantine / audit data.
 *
 * Auth: protected by AUDIT_SECRET env var (Bearer or ?secret= param).
 * If AUDIT_SECRET is not set, the endpoint is open.
 *
 * Useful for:
 *   - Admin dashboard "Recompute trust" button
 *   - Post-repair / post-audit cron step
 *   - After writing to quarantine.json or healing store
 */

import { NextRequest, NextResponse }       from 'next/server'
import { buildTrustReport, saveTrustReport } from '@/lib/catalog/trust/reports'
import { invalidateVisibilityContext }       from '@/lib/catalog/trust/visibility-engine'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Invalidate context cache so the recompute sees fresh data
    invalidateVisibilityContext()

    const report = buildTrustReport()
    saveTrustReport(report)

    return NextResponse.json(
      { ok: true, recomputed: true, ...report },
      { status: 200 },
    )
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    )
  }
}
