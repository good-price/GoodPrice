/**
 * GET /api/catalog/stabilization/report
 *
 * Returns the current stabilization report.
 *
 * Query params:
 *   ?recompute=1   — force a fresh computation and save the result
 *
 * Auth: AUDIT_SECRET
 *
 * Response:
 *   200 — report (healthy catalog)
 *   207 — report (catalog has suppressed products or degraded health)
 *   202 — recompute started, report returned
 *   401 — unauthorized
 *   404 — no report available (never computed)
 *   500 — computation error
 */

import { type NextRequest, NextResponse } from 'next/server'
import {
  buildStabilizationReport,
  saveStabilizationReport,
  loadStabilizationReport,
} from '@/lib/catalog/stabilization'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 60

// ── Auth ───────────────────────────────────────────────────────────────────────

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.AUDIT_SECRET
  if (!secret) return true
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
  const query  = req.nextUrl.searchParams.get('secret')
  return bearer === secret || query === secret
}

// ── GET handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const forceRecompute = req.nextUrl.searchParams.get('recompute') === '1'

  if (forceRecompute) {
    try {
      const report = await buildStabilizationReport()
      saveStabilizationReport(report)
      const degraded = report.healthScore.overall < 60 || report.ratios.suppressed > 0
      return NextResponse.json(
        { ok: true, report, recomputed: true },
        { status: degraded ? 207 : 202 },
      )
    } catch (err) {
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
    }
  }

  const cached = loadStabilizationReport()
  if (!cached) {
    return NextResponse.json(
      { ok: false, error: 'No stabilization report available. Run ?recompute=1 first.' },
      { status: 404 },
    )
  }

  const degraded = cached.healthScore.overall < 60 || cached.ratios.suppressed > 0
  return NextResponse.json(
    { ok: true, report: cached },
    { status: degraded ? 207 : 200 },
  )
}
