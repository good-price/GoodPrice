/**
 * POST /api/tpe/evaluate-local
 *
 * Runs gates 1–6 (local, no HTTP) against pending candidates in the pool.
 * Writes results back to data/tpe/candidate-pool.json in a single operation.
 *
 * ── Authentication (M1) ────────────────────────────────────────────────────
 * When CRON_SECRET is set, requires:
 *   Authorization: Bearer {CRON_SECRET}
 * In local development (CRON_SECRET unset) the header is optional.
 *
 * ── Vercel runtime guard (C1) ─────────────────────────────────────────────
 * On Vercel (VERCEL=1) dryRun is forced to true regardless of the request
 * body. The Vercel filesystem is immutable — fs.writeFileSync would throw
 * EROFS. Pool writes must happen via local scripts (scripts/evaluate-local.ts).
 * The response includes `forcedDryRun: true` so callers know why their
 * dryRun:false was overridden.
 *
 * ── Body (JSON, all fields optional) ──────────────────────────────────────
 *   limit   — max candidates to process (default: all pending)
 *   dryRun  — if true, compute but do not write (default: false; always true on Vercel)
 *
 * ── Responses ─────────────────────────────────────────────────────────────
 *   201 — evaluation complete, pool updated (or dryRun results)
 *   400 — invalid request body
 *   401 — missing or invalid Authorization header
 *   405 — wrong HTTP method
 */

import { NextRequest, NextResponse } from 'next/server'
import { evaluateLocalBatch } from '@/lib/tpe/admission'

// C1: Vercel's filesystem is read-only at runtime. Any write attempt (saveCandidatePool)
// would throw EROFS. Force dryRun when running on Vercel to prevent the error.
const ON_VERCEL = Boolean(process.env.VERCEL)

export async function POST(req: NextRequest) {
  // ── M1: Auth — CRON_SECRET ────────────────────────────────────────────────
  // Required when CRON_SECRET is configured (should always be set in production).
  // Unset in local dev → endpoint is open for developer convenience.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization') ?? ''
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized — Authorization: Bearer {CRON_SECRET} required' },
        { status: 401 },
      )
    }
  }

  // ── Body parse ─────────────────────────────────────────────────────────────
  let body: { limit?: unknown; dryRun?: unknown } = {}

  try {
    const text = await req.text()
    if (text.trim()) body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const limit = typeof body.limit === 'number' ? body.limit : undefined

  // C1: Force dryRun on Vercel — filesystem is immutable, writes would fail.
  // Local dev respects the caller's dryRun value (default: false → writes enabled).
  const requestedDryRun = typeof body.dryRun === 'boolean' ? body.dryRun : false
  const dryRun           = ON_VERCEL || requestedDryRun

  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    return NextResponse.json(
      { error: '"limit" must be a positive integer' },
      { status: 400 },
    )
  }

  const report = evaluateLocalBatch({ limit, dryRun })

  return NextResponse.json(
    {
      ok:               true,
      dryRun,
      // forcedDryRun: true means ON_VERCEL overrode the caller's dryRun:false.
      // Pool was NOT written. Use scripts/evaluate-local.ts locally to persist.
      forcedDryRun:        ON_VERCEL && !requestedDryRun,
      runAt:               report.runAt,
      durationMs:          report.durationMs,
      total:               report.total,
      passedLocalGates:    report.passedLocalGates,
      rejected:            report.rejected,
      exhausted:           report.exhausted,
      topRejectionReasons: report.topRejectionReasons,
      byCategory:          report.byCategory,
      // Full per-candidate records omitted to keep payload small.
    },
    { status: 201 },
  )
}
