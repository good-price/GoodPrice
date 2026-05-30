/**
 * POST /api/ops/products/action
 *
 * Executes a single product action (activate, suppress, quarantine, etc.).
 *
 * Auth: AUDIT_SECRET
 *
 * Body (JSON):
 * {
 *   productId:  string        — required
 *   action:     ProductAction — required
 *   reason:     string        — required (min 5 chars)
 *   operator?:  string        — default: 'api'
 *   options?:   object        — action-specific options
 * }
 *
 * Response:
 *   200 — action executed successfully
 *   400 — invalid body or validation failed
 *   401 — unauthorized
 *   404 — product not found
 *   500 — execution error
 */

import { type NextRequest, NextResponse } from 'next/server'
import { executeProductAction }           from '@/lib/ops/actions'
import type { ProductAction }             from '@/lib/ops/actions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ── Valid actions ──────────────────────────────────────────────────────────────

const VALID_ACTIONS = new Set<ProductAction>([
  'activate', 'downgrade', 'suppress', 'quarantine', 'unquarantine',
  'archive', 'restore', 'repair', 'revalidate',
  'refresh-truth', 'refresh-pricing', 'rerun-repair',
])

// ── Auth ───────────────────────────────────────────────────────────────────────

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.AUDIT_SECRET
  if (!secret) return true
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
  const query  = req.nextUrl.searchParams.get('secret')
  return bearer === secret || query === secret
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const productId = typeof body.productId === 'string' ? body.productId.trim() : ''
  const action    = typeof body.action    === 'string' ? body.action    : ''
  const reason    = typeof body.reason    === 'string' ? body.reason.trim() : ''
  const operator  = typeof body.operator  === 'string' ? body.operator  : 'api'
  const options   = typeof body.options   === 'object' && body.options !== null
    ? body.options as Record<string, unknown>
    : {}

  if (!productId) {
    return NextResponse.json({ ok: false, error: 'productId is required' }, { status: 400 })
  }
  if (!action || !VALID_ACTIONS.has(action as ProductAction)) {
    return NextResponse.json(
      { ok: false, error: `Invalid action. Valid: ${Array.from(VALID_ACTIONS).join(', ')}` },
      { status: 400 },
    )
  }
  if (reason.length < 5) {
    return NextResponse.json(
      { ok: false, error: 'reason must be at least 5 characters' },
      { status: 400 },
    )
  }

  const result = await executeProductAction(
    productId, action as ProductAction, operator, reason, options,
  )

  if (result.error === 'PRODUCT_NOT_FOUND') {
    return NextResponse.json({ ok: false, error: result.message }, { status: 404 })
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, result }, { status: 200 })
}
