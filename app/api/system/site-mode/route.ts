import { type NextRequest, NextResponse } from 'next/server'
import { readSiteMode, setSiteMode }      from '@/lib/system/site-mode'
import { isAdminRequest }                 from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET() {
  const state = readSiteMode()
  return NextResponse.json({
    ok:           true,
    mode:         state.mode,
    updatedAt:    state.updatedAt,
    previousMode: state.previousMode,
  })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const newMode = body.mode
  if (newMode !== 'public' && newMode !== 'development') {
    return NextResponse.json(
      { ok: false, error: `Invalid mode: "${newMode}". Allowed: public, development` },
      { status: 400 },
    )
  }

  const current  = readSiteMode()
  const previous = current.mode

  if (previous === newMode) {
    return NextResponse.json({
      ok:       true,
      message:  `Mode already set to "${newMode}" — no change`,
      previous,
      current:  newMode,
      updatedAt: current.updatedAt,
    })
  }

  const state = setSiteMode(newMode)

  return NextResponse.json({
    ok:        true,
    previous,
    current:   state.mode,
    updatedAt: state.updatedAt,
  })
}
