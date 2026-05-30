/**
 * POST /api/pricing/check
 *
 * Triggers a full price-check cycle across all mapped products.
 * Called by Vercel Cron (see vercel.json) and can also be triggered manually.
 *
 * Authentication:
 *   - Vercel Cron sends Authorization: Bearer {CRON_SECRET}
 *   - Manual calls from localhost skip auth check (NODE_ENV=development)
 *   - All production calls require the correct Bearer token
 *
 * Request body (all optional):
 *   {
 *     "productIds": ["elec-001", "game-002"],  // subset mode
 *     "forceSearch": true                       // clear mlItemId, re-search
 *   }
 *
 * Response 200:
 *   {
 *     "ok": true,
 *     "summary": "...",
 *     "result": { ... PriceCheckJobResult }
 *   }
 *
 * Response 401: missing/wrong authorization
 * Response 500: unexpected job failure
 */

import { NextRequest, NextResponse } from 'next/server'
import { runPriceCheckJob, formatJobSummary } from '@/lib/pricing/jobs/price-check'
import { startJob, completeJob, failJob } from '@/lib/ops/job-logger'
import { jobLogger } from '@/lib/ops/logger'

const log = jobLogger('price-check')

export const runtime  = 'nodejs'  // needs fs/promises — can't run on Edge
export const dynamic  = 'force-dynamic'
export const maxDuration = 300    // 5 minutes max (Vercel Pro limit)

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ─────────────────────────────────────────────────────────────────

  const cronSecret = process.env.CRON_SECRET
  const isDev      = process.env.NODE_ENV === 'development'

  if (!isDev && cronSecret) {
    const auth  = req.headers.get('authorization') ?? ''
    const token = auth.replace('Bearer ', '')

    if (token !== cronSecret) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }
  }

  // ── Parse body ────────────────────────────────────────────────────────────

  let productIds: string[] | undefined
  let forceSearch = false

  try {
    const body = await req.json().catch(() => ({}))
    if (Array.isArray(body.productIds)) productIds = body.productIds
    if (body.forceSearch === true) forceSearch = true
  } catch {
    // Invalid JSON — treat as empty body, use defaults
  }

  // ── Run job ───────────────────────────────────────────────────────────────

  const runId = startJob('price-check', { productIds, forceSearch })

  try {
    log.info('Starting job', { productIds, forceSearch })
    const result  = await runPriceCheckJob({ productIds, forceSearch })
    const summary = formatJobSummary(result)
    const status  = result.summary.error > 0 ? 'partial' : 'success'

    completeJob('price-check', runId, {
      summary,
      status,
      meta: { processed: result.processed, errors: result.summary.error },
    })

    return NextResponse.json({ ok: true, summary, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failJob('price-check', runId, message)

    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
