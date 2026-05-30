/**
 * GET /api/ops/recovery/report
 *
 * Returns the full ActivationReport — all subsystems combined.
 * Called on page load and after recovery completion.
 * Fast — reads from disk caches only.
 */

import { NextResponse }            from 'next/server'
import { buildActivationReport }   from '@/lib/ops/activation/reports'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const report = buildActivationReport()
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
