/**
 * POST /api/ops/cancel
 *
 * Cancels a running or queued job by its ID.
 * The job runner checks isJobCancelled() before each product,
 * so cancellation takes effect at the next checkpoint.
 *
 * Auth: AUDIT_SECRET
 *
 * Body: { jobId: string }
 *
 * Response:
 *   200 — job cancelled
 *   404 — job not found
 *   409 — job already in terminal state
 *   401 — unauthorized
 */

import { type NextRequest, NextResponse } from 'next/server'
import { cancelJob, getJob, forceReleaseLock } from '@/lib/ops/execution'
import type { ExecJobType }                    from '@/lib/ops/execution'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.AUDIT_SECRET
  if (!secret) return true
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
  const query  = req.nextUrl.searchParams.get('secret')
  return bearer === secret || query === secret
}

export async function POST(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch { /* bad body */ }

  const jobId = typeof body.jobId === 'string' ? body.jobId : null
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Missing required field: 'jobId'" }, { status: 400 })
  }

  const job = getJob(jobId)
  if (!job) {
    return NextResponse.json({ ok: false, error: `Job '${jobId}' not found` }, { status: 404 })
  }

  if (job.status === 'completed' || job.status === 'failed') {
    return NextResponse.json(
      { ok: false, error: `Job '${jobId}' already in terminal state: ${job.status}` },
      { status: 409 },
    )
  }

  const cancelled = cancelJob(jobId)
  if (!cancelled && job.status !== 'cancelled') {
    return NextResponse.json({ ok: false, error: 'Could not cancel job' }, { status: 500 })
  }

  // Release any lock the job was holding
  forceReleaseLock(job.type as ExecJobType)

  return NextResponse.json({
    ok:     true,
    jobId,
    status: 'cancelled',
    message: `Job '${job.type}' marcado para cancelación. Se detendrá en el próximo punto de control.`,
  })
}
