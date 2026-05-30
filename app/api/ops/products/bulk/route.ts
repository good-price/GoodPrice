/**
 * POST /api/ops/products/bulk
 *
 * Executes the same action on multiple products.
 *
 * Auth: AUDIT_SECRET
 *
 * Body (JSON):
 * {
 *   productIds: string[]      — required (max 100)
 *   action:     ProductAction — required
 *   reason:     string        — required (min 5 chars)
 *   operator?:  string        — default: 'api'
 *   options?:   object
 * }
 *
 * Response:
 *   200 — all succeeded
 *   207 — partial success (some failed)
 *   400 — invalid body
 *   401 — unauthorized
 *   500 — fatal error
 */

import { type NextRequest, NextResponse } from 'next/server'
import { executeBulkAction }              from '@/lib/ops/actions'
import type { ProductAction }             from '@/lib/ops/actions'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 120

const VALID_ACTIONS = new Set<ProductAction>([
  'activate', 'downgrade', 'suppress', 'quarantine', 'unquarantine',
  'archive', 'restore', 'repair', 'revalidate',
  'refresh-truth', 'refresh-pricing', 'rerun-repair',
])

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

  const productIds = Array.isArray(body.productIds)
    ? (body.productIds as unknown[]).filter(id => typeof id === 'string') as string[]
    : []
  const action   = typeof body.action   === 'string' ? body.action   : ''
  const reason   = typeof body.reason   === 'string' ? body.reason.trim() : ''
  const operator = typeof body.operator === 'string' ? body.operator : 'api'
  const options  = typeof body.options  === 'object' && body.options !== null
    ? body.options as Record<string, unknown>
    : {}

  if (productIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'productIds array is required and must not be empty' }, { status: 400 })
  }
  if (!action || !VALID_ACTIONS.has(action as ProductAction)) {
    return NextResponse.json(
      { ok: false, error: `Invalid action. Valid: ${Array.from(VALID_ACTIONS).join(', ')}` },
      { status: 400 },
    )
  }
  if (reason.length < 5) {
    return NextResponse.json({ ok: false, error: 'reason must be at least 5 characters' }, { status: 400 })
  }

  try {
    const result = await executeBulkAction(productIds, action as ProductAction, operator, reason, options)
    const status = result.failed === 0 ? 200 : result.succeeded === 0 ? 400 : 207
    return NextResponse.json({ ok: result.ok, result }, { status })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
