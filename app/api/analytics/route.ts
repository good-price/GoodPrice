import { NextRequest, NextResponse } from 'next/server'
import { buildObservabilityReport } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics
 * Behavior-focused observability report.
 *
 * Returns:
 *   meta          → server uptime, generation timestamp
 *   summary       → at-a-glance numbers (events, catalog size, dead rate)
 *   topProducts   → clicked products ranked by clicks, with clickShare %
 *   topCategories → most visited categories
 *   insights      → top performer, most/least active category, dead product count
 *
 * Optional protection: set ANALYTICS_SECRET env var.
 * Request with: Authorization: Bearer <secret>
 *
 * For the full product table (every product with click data), use:
 *   GET /api/analytics/catalog
 */
export async function GET(req: NextRequest) {
  // Optional secret gate
  const secret = process.env.ANALYTICS_SECRET
  if (secret) {
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (token !== secret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  const report = await buildObservabilityReport()

  return NextResponse.json({ ok: true, ...report })
}
