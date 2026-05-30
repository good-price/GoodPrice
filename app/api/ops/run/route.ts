/**
 * POST /api/ops/run
 *
 * Enqueues and immediately executes a catalog operation job.
 *
 * Auth: AUDIT_SECRET
 *
 * Body (JSON):
 * {
 *   type:      ExecJobType   — required
 *   options?:  object        — job-specific options
 *   operator?: string        — identifier for audit log (default: 'api')
 *   pipeline?: string        — pipeline id to run ('recovery' | 'quick-recovery' | 'audit')
 * }
 *
 * If `pipeline` is provided, the body runs the full pipeline instead of a single job.
 *
 * Mutex: returns HTTP 409 if the job type (or any pipeline stage) is already running.
 *
 * Response:
 *   202 — job created and started (async or sync depending on type)
 *   409 — conflict: job type already running
 *   400 — invalid body
 *   401 — unauthorized
 *   500 — execution error
 */

import { type NextRequest, NextResponse }     from 'next/server'
import { isAdminRequest } from '@/lib/admin/auth'
import {
  createJob,
  updateJob,
  acquireLock,
  releaseLock,
  isJobTypeRunning,
  appendToLog,
  runJob,
  ALL_PIPELINES,
  runPipeline,
} from '@/lib/ops/execution'
import type { ExecJobType }                   from '@/lib/ops/execution'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 300   // 5 min — long-running audits

// ── Valid job types ───────────────────────────────────────────────────────────

const VALID_JOB_TYPES_LIST: ExecJobType[] = [
  'trust-recompute',
  'repair',
  'live-truth',
  'link-audit',
  'colombia-audit',
  'self-healing',
  'paapi-sync',
]
const VALID_JOB_TYPES = new Set<ExecJobType>(VALID_JOB_TYPES_LIST)

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch { /* empty body — bad request below */ }

  const operator = typeof body.operator === 'string' ? body.operator : 'api'
  const options  = typeof body.options  === 'object' && body.options !== null
    ? body.options as Record<string, unknown>
    : {}

  // ── Pipeline mode ──────────────────────────────────────────────────────────
  if (typeof body.pipeline === 'string') {
    const def = ALL_PIPELINES.find(p => p.id === body.pipeline)
    if (!def) {
      return NextResponse.json(
        { ok: false, error: `Unknown pipeline: '${body.pipeline}'. Valid: ${ALL_PIPELINES.map(p => p.id).join(', ')}` },
        { status: 400 },
      )
    }

    // Check if any stage is locked
    const lockedStages = def.stages.filter(s => isJobTypeRunning(s))
    if (lockedStages.length > 0) {
      return NextResponse.json(
        { ok: false, error: 'Conflicto: etapas en ejecución', lockedStages },
        { status: 409 },
      )
    }

    try {
      const run = await runPipeline(def, options, operator)
      return NextResponse.json(
        { ok: true, pipeline: run, status: run.status },
        { status: run.status === 'completed' ? 200 : 207 },
      )
    } catch (err) {
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
    }
  }

  // ── Single job mode ────────────────────────────────────────────────────────
  const type = body.type as ExecJobType | undefined
  if (!type || !VALID_JOB_TYPES.has(type)) {
    return NextResponse.json(
      { ok: false, error: `Missing or invalid 'type'. Valid: ${VALID_JOB_TYPES_LIST.join(', ')}` },
      { status: 400 },
    )
  }

  // Mutex check
  if (isJobTypeRunning(type)) {
    return NextResponse.json(
      { ok: false, error: `Job '${type}' ya está en ejecución. Espera a que termine o cancélalo.` },
      { status: 409 },
    )
  }

  // Acquire mutex
  const job = createJob(type, options, operator)
  if (!acquireLock(type, job.id)) {
    // Race condition — someone acquired the lock between check and acquire
    updateJob(job.id, { status: 'cancelled', error: 'Lock adquirido por otro proceso', completedAt: new Date().toISOString() })
    return NextResponse.json(
      { ok: false, error: `Job '${type}' ya está en ejecución (lock race).` },
      { status: 409 },
    )
  }

  try {
    const result = await runJob(job)
    appendToLog({ ...job, result, status: 'completed', completedAt: new Date().toISOString() })

    return NextResponse.json(
      { ok: true, jobId: job.id, type, result, status: 'completed' },
      { status: 200 },
    )
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    appendToLog({ ...job, status: 'failed', completedAt: new Date().toISOString(), result: null, error })

    return NextResponse.json(
      { ok: false, jobId: job.id, error },
      { status: 500 },
    )
  } finally {
    releaseLock(type)
  }
}
