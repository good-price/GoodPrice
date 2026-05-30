/**
 * GET /api/ops/recovery/report
 *
 * Returns the full ActivationReport — all subsystems combined.
 * Called on page load and after recovery completion.
 * Fast — reads from disk caches only.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { buildActivationReport }   from '@/lib/ops/activation/reports'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = buildActivationReport()
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
