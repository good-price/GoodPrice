/**
 * POST /api/ops/recovery
 *
 * Triggers the full catalog recovery pipeline.
 * Captures a "before" snapshot, runs the pipeline, captures "after".
 *
 * Returns 409 if a recovery is already in progress.
 * Long-running — up to 5 minutes (all pipeline stages).
 */

import { type NextRequest, NextResponse }   from 'next/server'
import { runCatalogRecovery, loadRecoveryRun } from '@/lib/ops/activation/catalog-recovery'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Check if already running
  try {
    const current = loadRecoveryRun()
    if (current?.status === 'running') {
      return NextResponse.json(
        { ok: false, error: 'Recovery already in progress', runId: current.id },
        { status: 409 },
      )
    }
  } catch { /* no existing run */ }

  let operator = 'admin'
  try {
    const body = await req.json() as { operator?: string }
    if (body.operator) operator = body.operator
  } catch { /* empty body */ }

  try {
    const run = await runCatalogRecovery(operator)
    return NextResponse.json({
      ok:     true,
      runId:  run.id,
      status: run.status,
      before: run.before,
      after:  run.after,
      stages: run.stages.map(s => ({ stage: s.stage, status: s.status, label: s.label })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const run = loadRecoveryRun()
    return NextResponse.json({ ok: true, run })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
