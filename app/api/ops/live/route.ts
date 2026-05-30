/**
 * app/api/ops/live/route.ts
 *
 * GET /api/ops/live
 *
 * Returns a fresh OpsSnapshot for polling by the workspace chrome
 * (LiveExecutionFeed polls every 5s).
 *
 * Fast — buildOpsSnapshot() reads only from disk/memory, no network calls.
 */

import { NextResponse }      from 'next/server'
import { buildOpsSnapshot }  from '@/lib/ops/workspace/realtime-engine'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const snapshot = buildOpsSnapshot()
    return NextResponse.json({ ok: true, snapshot })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
