/**
 * POST /api/currency/update
 *
 * Fetches a fresh USD→COP exchange rate from external providers and
 * writes it to data/currency/usd-cop.json.
 *
 * Provider fallback order:
 *   1. exchangerate.host
 *   2. open.er-api.com
 *   3. frankfurter.app
 *   4. Wise page parsing
 *
 * Cron schedule (Vercel Cron or external):
 *   "0 8 * * *"  →  08:00 UTC = 03:00 AM Colombia time (UTC-5)
 *
 * Vercel cron configuration (add to vercel.json):
 *   {
 *     "crons": [
 *       { "path": "/api/currency/update", "schedule": "0 8 * * *" }
 *     ]
 *   }
 *
 * Auth: protected by AUDIT_SECRET env var (same as catalog audit endpoints).
 * If AUDIT_SECRET is not set, the endpoint is open (dev / local only).
 *
 * Response:
 *   200 { ok: true,  rate, source, durationMs }
 *   200 { ok: false, rate, source, error, stale: true }  ← stale cache returned
 *   500 { ok: false, error }                             ← all providers failed, no cache
 */

import { NextRequest, NextResponse } from 'next/server'
import { updateExchangeRate } from '@/lib/currency/exchange-service'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()

  try {
    const result = await updateExchangeRate()
    const durationMs = Date.now() - start

    // HTTP 207 when we had to fall back to stale cache
    const status = result.ok ? 200 : (result.stale ? 207 : 500)

    return NextResponse.json({ ...result, durationMs }, { status })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    )
  }
}
