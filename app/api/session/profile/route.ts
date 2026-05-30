/**
 * GET /api/session/profile
 *
 * Returns personalised product recommendations based on anonymous session signals.
 * Called by PersonalizedSection (client component) after it reads the session profile.
 *
 * Query parameters:
 *   cats     string   Comma-separated category slugs in affinity order (required)
 *   limit    number   Max products to return (default 6, max 12)
 *   exclude  string   Comma-separated product IDs to exclude (already-seen)
 *
 * Algorithm:
 *   1. Parse preferred categories from `cats` — order implies affinity rank
 *   2. Get all public products in those categories (server-side catalog singleton)
 *   3. Filter out `exclude` product IDs
 *   4. Sort: category affinity rank first → rating + reviews within tier
 *   5. Return the top `limit` products
 *
 * Privacy:
 *   - No session ID or personal data accepted
 *   - Categories are the only personalisation signal received
 *   - All responses are products already public in the catalog
 *
 * Caching:
 *   cache: 'no-store' on the client to get fresh personalization
 *   No server-side cache — catalog is already a module-level singleton
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPublicProducts } from '@/lib/catalog/public'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)

  // ── Parse query params ────────────────────────────────────────────────────
  const cats    = searchParams.get('cats')?.split(',').filter(Boolean) ?? []
  const limit   = Math.min(Math.max(1, Number(searchParams.get('limit') ?? '6')), 12)
  const exclude = new Set(searchParams.get('exclude')?.split(',').filter(Boolean) ?? [])

  if (cats.length === 0) {
    return NextResponse.json({ products: [] })
  }

  // ── Fetch and filter catalog ──────────────────────────────────────────────
  const catSet = new Set(cats)
  const all    = getPublicProducts()

  const candidates = all.filter(p =>
    catSet.has(p.category) && !exclude.has(p.id ?? ''),
  )

  if (candidates.length === 0) {
    return NextResponse.json({ products: [] })
  }

  // ── Sort: category affinity rank (position in cats[]) → rating desc ───────
  // Lower catRank = more preferred (cats is ordered highest-affinity first)
  const catRank = new Map(cats.map((c, i) => [c, i]))

  candidates.sort((a, b) => {
    const rankA = catRank.get(a.category) ?? cats.length
    const rankB = catRank.get(b.category) ?? cats.length
    if (rankA !== rankB) return rankA - rankB
    // Within the same category: sort by rating then reviews (quality signal)
    return b.rating - a.rating || b.reviews - a.reviews
  })

  // ── Return top N products ─────────────────────────────────────────────────
  const products = candidates.slice(0, limit)

  return NextResponse.json({ products }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
