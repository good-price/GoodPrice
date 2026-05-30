/**
 * GET /api/ops/recovery/status
 *
 * Returns the current (or last) recovery run status.
 * Polled every 3s by the RecoveryCenter component during active recovery.
 *
 * Response includes:
 *   run      — RecoveryRun (current or last)
 *   isActive — whether a recovery is in progress
 */

import { NextResponse }                                        from 'next/server'
import { loadRecoveryRun }                                     from '@/lib/ops/activation/catalog-recovery'
import { computeVisibilityAudit }                              from '@/lib/ops/activation/visibility-audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const run      = loadRecoveryRun()
    const isActive = run?.status === 'running'

    // Include a fresh visibility audit so the UI can show live counts
    const audit = computeVisibilityAudit()

    return NextResponse.json({
      ok:  true,
      run,
      isActive,
      audit,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
