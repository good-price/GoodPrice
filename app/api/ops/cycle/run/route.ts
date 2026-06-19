/**
 * app/api/ops/cycle/run/route.ts
 *
 * POST /api/ops/cycle/run
 *
 * Triggers the Master Cycle. Used by:
 *   - Vercel Cron at 03:00 AM America/Bogota (scheduled trigger)
 *   - Automation Center "Ejecutar ciclo" button (manual trigger)
 *
 * Sprint 1A: runs the infrastructure-level pipeline (no real workers).
 * Sprint 1B: stages will call actual job runners.
 *
 * Returns the CycleRunResult as JSON.
 */

import { NextResponse }    from 'next/server'
import { runMasterCycle }  from '@/lib/ops/cycle'

export const dynamic = 'force-dynamic'

export async function POST(): Promise<NextResponse> {
  try {
    const result = await runMasterCycle()

    return NextResponse.json(
      {
        ok:     true,
        result,
      },
      { status: 200 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    )
  }
}
