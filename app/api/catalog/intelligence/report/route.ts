/**
 * GET /api/catalog/intelligence/report
 *
 * Returns the full catalog intelligence report.
 * Computes health scores, lifecycle states, trends, suppression/promotion queues,
 * and discovery suggestions from live catalog + analytics data.
 *
 * Query params:
 *   ?discovery=0  → skip discovery suggestions (faster response)
 *   ?secret=...   → auth token (same as AUDIT_SECRET)
 *
 * Auth: protected by AUDIT_SECRET env var (Bearer or ?secret= param).
 * If AUDIT_SECRET is not set, the endpoint is open.
 *
 * Response: IntelligenceReport
 * HTTP 207 if any suppression candidates exist.
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateIntelligenceReport } from '@/lib/catalog/intelligence'

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

  const includeDiscovery = req.nextUrl.searchParams.get('discovery') !== '0'

  try {
    const report = await generateIntelligenceReport({ includeDiscovery })

    const hasIssues = report.suppressionQueue.length > 0

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
