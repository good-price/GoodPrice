/**
 * POST /api/catalog/repair/run
 *
 * Triggers a catalog repair pipeline run.
 *
 * Body (JSON, all optional):
 *   {
 *     limit?:               number   // max products to process (default: 20)
 *     dryRun?:              boolean  // analyse only, don't patch files (default: false)
 *     categories?:          string[] // only process these category slugs
 *     reasons?:             string[] // only process these RepairReason types
 *     confidenceThreshold?: number   // min confidence to auto-apply (default: 85)
 *   }
 *
 * Auth: protected by AUDIT_SECRET env var (Bearer token or ?secret= query param).
 * If AUDIT_SECRET is not set, the endpoint is open (dev convenience).
 *
 * Returns:
 *   PipelineResult with per-job details and summary counts.
 *   HTTP 207 Multi-Status if some jobs failed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runCatalogRepair } from '@/lib/catalog/repair'
import type { RepairOptions } from '@/lib/catalog/repair'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // ── Auth gate ──────────────────────────────────────────────────────────────
  const secret = process.env.AUDIT_SECRET
  if (secret) {
    const authHeader  = req.headers.get('authorization')
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const querySecret = req.nextUrl.searchParams.get('secret')
    if (bearerToken !== secret && querySecret !== secret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Parse options ──────────────────────────────────────────────────────────
  let options: RepairOptions = {}
  try {
    const body = await req.text()
    if (body.trim()) {
      const parsed = JSON.parse(body) as RepairOptions
      options = {
        limit:               typeof parsed.limit === 'number' ? Math.min(parsed.limit, 50) : 20,
        dryRun:              parsed.dryRun === true,
        categories:          Array.isArray(parsed.categories) ? parsed.categories : undefined,
        reasons:             Array.isArray(parsed.reasons) ? parsed.reasons : undefined,
        confidenceThreshold: typeof parsed.confidenceThreshold === 'number'
          ? Math.min(Math.max(parsed.confidenceThreshold, 50), 100)
          : 85,
      }
    }
  } catch {
    // No body or invalid JSON — use defaults
    options = { limit: 20, dryRun: false }
  }

  // ── Run pipeline ───────────────────────────────────────────────────────────
  const startMs = Date.now()
  let result
  try {
    result = await runCatalogRepair(options)
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    )
  }

  const hasFailures =
    result.noCandidate > 0 ||
    result.needsPaapi > 0 ||
    result.jobs.some(j => j.error)

  return NextResponse.json(
    {
      ok: true,
      ...result,
      elapsedMs: Date.now() - startMs,
    },
    { status: hasFailures ? 207 : 200 },
  )
}
