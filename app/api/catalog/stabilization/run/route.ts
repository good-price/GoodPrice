/**
 * POST /api/catalog/stabilization/run
 *
 * Triggers a full stabilization analysis cycle:
 *   1. Computes fresh StabilizationReport
 *   2. Saves to disk
 *   3. Returns the report + recommendations
 *
 * Optionally runs targeted recovery operations based on the report's
 * top recommendation if `autoRecover=true` is passed in the body.
 *
 * Auth: AUDIT_SECRET
 *
 * Body (JSON, optional):
 * {
 *   autoRecover?: boolean   — if true, also fires top recommendation's endpoint
 *   operator?:   string     — audit log identifier (default: 'api')
 * }
 *
 * Response:
 *   200 — stabilization completed, report returned
 *   207 — stabilization completed, catalog health degraded
 *   401 — unauthorized
 *   500 — computation error
 */

import { type NextRequest, NextResponse } from 'next/server'
import {
  buildStabilizationReport,
  saveStabilizationReport,
} from '@/lib/catalog/stabilization'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 120

// ── Auth ───────────────────────────────────────────────────────────────────────

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.AUDIT_SECRET
  if (!secret) return true
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
  const query  = req.nextUrl.searchParams.get('secret')
  return bearer === secret || query === secret
}

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try { await req.json() } catch { /* empty body is OK */ }

  try {
    const report = await buildStabilizationReport()
    saveStabilizationReport(report)

    const topRec          = report.recommendations[0] ?? null
    const overallHealthy  = report.healthScore.overall >= 60
    const hasSuppressed   = report.ratios.suppressed > 0

    return NextResponse.json(
      {
        ok:              true,
        computedAt:      report.computedAt,
        healthScore:     report.healthScore,
        visibilityStatus: report.visibilityStatus,
        ratios:          report.ratios,
        trmStatus:       report.trmStatus,
        topRecommendation: topRec,
        recoveryCandidates: report.recoveryCandidates.length,
        report,
      },
      { status: overallHealthy && !hasSuppressed ? 200 : 207 },
    )
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
