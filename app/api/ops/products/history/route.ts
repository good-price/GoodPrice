/**
 * GET /api/ops/products/history
 *
 * Returns the action history / lifecycle timeline for a product.
 *
 * Query params:
 *   ?productId=xxx   — required
 *   ?audit=1         — include raw audit log entries (default: false)
 *
 * Auth: AUDIT_SECRET
 *
 * Response:
 *   200 — timeline + optional audit entries
 *   400 — missing productId
 *   401 — unauthorized
 */

import { type NextRequest, NextResponse } from 'next/server'
import { buildProductTimeline }           from '@/lib/ops/actions'
import { getProductAuditHistory }         from '@/lib/ops/actions'
import { getOverride }                    from '@/lib/ops/actions'
import { getModerationEntry }             from '@/lib/ops/actions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.AUDIT_SECRET
  if (!secret) return true
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
  const query  = req.nextUrl.searchParams.get('secret')
  return bearer === secret || query === secret
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const productId = req.nextUrl.searchParams.get('productId')
  if (!productId) {
    return NextResponse.json({ ok: false, error: 'productId query param is required' }, { status: 400 })
  }

  const includeAudit = req.nextUrl.searchParams.get('audit') === '1'

  const timeline   = buildProductTimeline(productId)
  const override   = getOverride(productId)
  const moderation = getModerationEntry(productId)
  const audit      = includeAudit ? getProductAuditHistory(productId) : undefined

  return NextResponse.json({
    ok:        true,
    productId,
    timeline,
    override,
    moderation,
    ...(audit !== undefined && { audit }),
  })
}
