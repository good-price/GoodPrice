/**
 * GET /api/watchlist/status?ids=id1,id2,...
 *
 * Returns the public-catalog status for a list of product IDs from the user's
 * local watchlist. Used by WatchlistGrid to detect products that were removed
 * from the public catalog (quarantined, audited out, or suppressed).
 *
 * Query params:
 *   ids  — comma-separated product IDs (max 50)
 *
 * Response:
 *   { status: Record<string, 'active' | 'removed'> }
 *
 * 'active'  → product passes all 10 public-safety gates and is visible
 * 'removed' → product no longer passes at least one gate (or was never found)
 *
 * This endpoint is intentionally open (no auth) — it only exposes product IDs,
 * not pricing, inventory, or user data.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getPublicProducts } from '@/lib/catalog/public'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_IDS = 50

export function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids') ?? ''
  const ids = idsParam
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .slice(0, MAX_IDS)

  if (ids.length === 0) {
    return NextResponse.json(
      { status: {} },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  // Build a Set of publicly safe product IDs at request time
  // getPublicProducts() is cached at module-init — this is O(n) once, then O(1) per lookup
  const publicIdSet = new Set(getPublicProducts().map(p => p.id ?? ''))

  const status: Record<string, 'active' | 'removed'> = {}
  for (const id of ids) {
    status[id] = publicIdSet.has(id) ? 'active' : 'removed'
  }

  return NextResponse.json(
    { status },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
