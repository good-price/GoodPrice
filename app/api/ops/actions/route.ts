/**
 * POST /api/ops/actions
 *
 * Execute an admin quick action from the Operations Center.
 * Directly executable actions are run server-side; others return
 * the endpoint reference for manual invocation.
 *
 * Auth: AUDIT_SECRET
 *
 * Body:
 *   {
 *     action: string         // action id from getAvailableActions()
 *     params?: Record<string, unknown>  // optional overrides
 *   }
 *
 * Response:
 *   { ok: boolean, actionId: string, durationMs: number, message: string, data?: object }
 *
 * Directly executable actions:
 *   run_healing           — runs runHealingCycle()
 *   run_healing_dry       — runs runHealingCycle({ dryRun: true })
 *   clear_all_suppressions — clears all auto-suppressions
 *
 * All other action ids return ok:false with endpoint information.
 *
 * GET /api/ops/actions — returns the list of available actions (no auth required)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { executeAction, getAvailableActions } from '@/lib/ops'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 120

// ── GET — list available actions ──────────────────────────────────────────────

export function GET() {
  return NextResponse.json({
    ok:      true,
    actions: getAvailableActions(),
  })
}

// ── POST — execute action ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch { /* empty body */ }

  const actionId = typeof body.action === 'string' ? body.action : null
  if (!actionId) {
    return NextResponse.json(
      { ok: false, error: 'Missing required field: action' },
      { status: 400 },
    )
  }

  const params = typeof body.params === 'object' && body.params !== null
    ? body.params as Record<string, unknown>
    : undefined

  const result = await executeAction(actionId, params)
  return NextResponse.json(result, { status: result.ok ? 200 : 422 })
}
