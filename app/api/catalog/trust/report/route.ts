/**
 * GET /api/catalog/trust/report
 *
 * Returns the latest persisted TrustReport from disk.
 * Does NOT trigger recomputation — use POST /recompute for that.
 *
 * Query params:
 *   ?recompute=1  → force a fresh recompute before responding (same as /recompute but GET-friendly)
 *   ?secret=...   → auth token (same as AUDIT_SECRET)
 *
 * Auth: protected by AUDIT_SECRET env var (Bearer or ?secret= param).
 * If AUDIT_SECRET is not set, the endpoint is open.
 *
 * Response:
 *   200 — TrustReport found (or freshly computed)
 *   204 — No report available and recompute not requested
 *   207 — Report available but suppressed > 0
 */

import { NextRequest, NextResponse }                    from 'next/server'
import { loadTrustReport, buildTrustReport, saveTrustReport } from '@/lib/catalog/trust/reports'
import { invalidateVisibilityContext }                   from '@/lib/catalog/trust/visibility-engine'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const secret = process.env.AUDIT_SECRET
  if (secret) {
    const auth  = req.headers.get('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    const q     = req.nextUrl.searchParams.get('secret')
    if (token !== secret && q !== secret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  const forceRecompute = req.nextUrl.searchParams.get('recompute') === '1'

  try {
    let report = forceRecompute ? null : loadTrustReport()

    if (!report) {
      if (!forceRecompute) {
        // No cached report — return 204 so callers know to trigger a recompute
        return new NextResponse(null, { status: 204 })
      }
      // Force-recompute requested
      invalidateVisibilityContext()
      report = buildTrustReport()
      saveTrustReport(report)
    }

    const hasSuppressions = report.suppressed > 0

    return NextResponse.json(
      { ok: true, ...report },
      { status: hasSuppressions ? 207 : 200 },
    )
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    )
  }
}
