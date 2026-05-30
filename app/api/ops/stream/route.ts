/**
 * app/api/ops/stream/route.ts
 *
 * GET /api/ops/stream?since=ISO
 *
 * Returns recent live events, optionally filtered by timestamp.
 * Used by the LiveExecutionFeed to get events newer than its last fetch.
 *
 * Query params:
 *   since  — ISO timestamp; only events after this are returned
 *   limit  — max events to return (default 20, max 50)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getEventsSince, getWorkspaceLiveEvents } from '@/lib/ops/workspace/live-events'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const url   = new URL(request.url)
    const since = url.searchParams.get('since')
    const limit = Math.min(50, parseInt(url.searchParams.get('limit') ?? '20', 10))

    const events = since
      ? getEventsSince(since, limit)
      : getWorkspaceLiveEvents(limit)

    return NextResponse.json({ ok: true, events, count: events.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
