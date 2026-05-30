/**
 * GET /api/ops/activity
 *
 * Returns the unified operational activity timeline.
 *
 * Auth: AUDIT_SECRET
 *
 * Query params:
 *   ?limit=N          — max events (default: 30, max: 100)
 *   ?severity=warning — filter by minimum severity (info|warning|critical)
 *   ?subsystem=X      — filter by subsystem
 *   ?includeAlerts=0  — exclude alert events (default: include)
 *   ?includeAnomalies=0 — exclude anomaly events (default: include)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { buildTimeline } from '@/lib/ops'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.AUDIT_SECRET
  if (!secret) return true
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
  const query  = req.nextUrl.searchParams.get('secret')
  return bearer === secret || query === secret
}

export function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const sp          = req.nextUrl.searchParams
  const limit       = Math.min(parseInt(sp.get('limit') ?? '30', 10), 100)
  const minSeverity = (sp.get('severity') ?? 'info') as 'info' | 'warning' | 'critical'
  const subsystem   = sp.get('subsystem') ?? undefined
  const noAlerts    = sp.get('includeAlerts')    === '0'
  const noAnomalies = sp.get('includeAnomalies') === '0'

  const events = buildTimeline({
    limit,
    minSeverity,
    subsystem,
    includeAlerts:    !noAlerts,
    includeAnomalies: !noAnomalies,
  })

  return NextResponse.json(
    { ok: true, count: events.length, events },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
