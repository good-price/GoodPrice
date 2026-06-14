/**
 * POST /api/catalog/audit/daily
 *
 * Runs the daily health audit against all active products.
 * Called by Vercel Cron at 08:30 UTC daily (after the pricing check at 06:00).
 *
 * Products that fail suppression-worthy gates (unavailable, invalid ASIN,
 * missing image, missing price) are written to status-overrides.json and
 * hidden from the public catalog. Products that recover are removed.
 *
 * Authentication: Bearer {CRON_SECRET} in production; open in development.
 *
 * Response 200:
 *   {
 *     "ok": true,
 *     "summary": "22 checked — 16 healthy, 6 suppressed (4 new), 0 recovered",
 *     "result": { DailyAuditResult }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { runDailyAudit } from '@/lib/catalog/audit/daily-audit'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 300   // up to 5 min for full catalog scan

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ─────────────────────────────────────────────────────────────────

  const cronSecret = process.env.CRON_SECRET
  const isDev      = process.env.NODE_ENV === 'development'

  if (!isDev && cronSecret) {
    const auth  = req.headers.get('authorization') ?? ''
    const token = auth.replace('Bearer ', '')
    if (token !== cronSecret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Run audit ─────────────────────────────────────────────────────────────

  try {
    const result  = await runDailyAudit()
    const summary = [
      `${result.totalChecked} checked`,
      `${result.healthy} healthy`,
      `${result.unhealthy} suppressed (${result.newlySuppressed} new)`,
      result.recovered   > 0 ? `${result.recovered} recovered`    : null,
      result.transient   > 0 ? `${result.transient} transient`    : null,
    ].filter(Boolean).join(' — ')

    return NextResponse.json({ ok: true, summary, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
