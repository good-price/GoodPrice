/**
 * GET /api/ops/jobs
 *
 * Returns current active jobs, recent job history, and pipeline runs.
 * Used by the admin dashboard to poll execution state.
 *
 * Query params:
 *   ?limit=N      — recent job history limit (default: 20, max: 50)
 *   ?active=1     — return only active (queued/running) jobs
 *   ?type=X       — filter by job type
 *
 * Auth: AUDIT_SECRET
 *
 * Response: ExecReport
 */

import { type NextRequest, NextResponse } from 'next/server'
import {
  getActiveJobs,
  getRecentPipelines,
  getActiveLocks,
  getExecutionReport,
  getJobStaleness,
  getRecoveryStatus,
} from '@/lib/ops/execution'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const limit       = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 20, 50)
  const activeOnly  = req.nextUrl.searchParams.get('active') === '1'
  const typeFilter  = req.nextUrl.searchParams.get('type')

  if (activeOnly) {
    let jobs = getActiveJobs()
    if (typeFilter) jobs = jobs.filter(j => j.type === typeFilter)
    return NextResponse.json({ ok: true, jobs, activeLocks: getActiveLocks() })
  }

  const report         = getExecutionReport(limit)
  const staleness      = getJobStaleness()
  const recoveryStatus = getRecoveryStatus()
  const pipelines      = getRecentPipelines(5)

  return NextResponse.json({
    ok: true,
    ...report,
    staleness,
    recoveryStatus,
    pipelines,
    activeLocks: getActiveLocks(),
  })
}
