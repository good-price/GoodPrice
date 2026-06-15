/**
 * POST /api/catalog/discovery/run
 *
 * Runs the Best Sellers discovery pipeline for all 7 configured categories:
 *   Electronics · Video Games · Home & Kitchen · Sports & Outdoors
 *   Office Products · Pet Supplies · Tools & Home Improvement
 *
 * Flow:
 *   1. Fetch each category's Best Sellers page from Amazon
 *   2. Extract product tiles (ASIN, title, imageUrl, rating, reviews, price, rank)
 *   3. Pre-filter: rating ≥ 4.4, reviews ≥ 5 000, price $20–$300
 *   4. Deduplicate ASINs across categories
 *   5. Persist to data/catalog/discovery-candidates.json
 *
 * Response 200:
 *   {
 *     "ok": true,
 *     "discovered": 210,      // total tiles extracted (before pre-filter)
 *     "filtered":   150,      // tiles that did NOT pass pre-filter
 *     "candidates":  60,      // unique ASINs saved to the candidate store
 *     "runAt":      "2026-06-14T...",
 *     "byCategory": [
 *       { "category": "electronica", "extracted": 30, "filtered": 18, "passed": 12 },
 *       ...
 *     ]
 *   }
 *
 * Response 401: missing / wrong Authorization bearer token (production only)
 * Response 500: unexpected failure
 *
 * NOTE: Discovery does NOT run the Candidate Validator. Use
 *   POST /api/catalog/candidate/validate to validate individual ASINs from
 *   the candidate store.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runDiscovery }              from '@/lib/catalog/discovery/run-discovery'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ─────────────────────────────────────────────────────────────────

  const cronSecret = process.env.CRON_SECRET
  const isDev      = process.env.NODE_ENV === 'development'

  if (!isDev && cronSecret) {
    const auth  = req.headers.get('authorization') ?? ''
    const token = auth.replace('Bearer ', '')
    if (token !== cronSecret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  try {
    const result = await runDiscovery()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
