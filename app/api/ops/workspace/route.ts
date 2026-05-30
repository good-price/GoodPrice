/**
 * app/api/ops/workspace/route.ts
 *
 * GET  /api/ops/workspace  — returns workspace metadata (sections + metric defs)
 * POST /api/ops/workspace  — no-op (workspace state lives in localStorage)
 *
 * The workspace client state (sidebar collapsed, tabs, pinned metrics, etc.)
 * is managed entirely in localStorage by workspace-state.ts.
 * This endpoint provides the static configuration the client needs on load.
 */

import { NextResponse }    from 'next/server'
import { SECTION_DEFS }    from '@/lib/ops/workspace/navigation'
import { METRIC_DEFS }     from '@/lib/ops/workspace/pinned-views'
import { COMMAND_DEFS }    from '@/lib/ops/workspace/command-palette'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    workspace: {
      sections:    SECTION_DEFS,
      metricDefs:  METRIC_DEFS,
      commandDefs: COMMAND_DEFS,
    },
  })
}

// Workspace state is client-side only — this endpoint acknowledges but does nothing
export async function POST() {
  return NextResponse.json({ ok: true, message: 'Workspace state is client-side only.' })
}
