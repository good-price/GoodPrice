/**
 * GET /api/currency/rate
 *
 * Returns the current USD→COP exchange rate from the local cache.
 *
 * This endpoint reads from disk — it does NOT hit external APIs.
 * Use POST /api/currency/update to refresh the rate from providers.
 *
 * Response:
 *   { ok: true, rate, source, fetchedAt, expiresAt, isFallback }
 *
 * isExpired=true means the rate is stale (cron hasn't run yet today).
 * The stale rate is still returned — consumers decide how to handle staleness.
 *
 * Auth: none — rate information is public (no sensitive data).
 */

import { NextResponse } from 'next/server'
import { getRateMeta } from '@/lib/currency/cache'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET() {
  const meta = getRateMeta()
  return NextResponse.json({ ok: true, ...meta }, { status: 200 })
}
