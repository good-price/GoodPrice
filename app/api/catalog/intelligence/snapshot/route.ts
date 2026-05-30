/**
 * POST /api/catalog/intelligence/snapshot
 *
 * Regenerates the intelligence snapshot and writes it to disk.
 * The snapshot is the pre-computed bridge that lets sync ISR pages read
 * intelligence data (rank scores, lifecycle states, suppressed IDs) without
 * needing to await the async intelligence engine on every render.
 *
 * What this does:
 *   1. Runs generateIntelligenceReport() (fresh, no cache)
 *   2. Extracts the runtime-relevant slice via buildSnapshot()
 *   3. Writes it to data/catalog/intelligence-snapshot.json
 *
 * After this runs, all ISR pages will pick up new rankings within 10 minutes
 * (the in-process cache TTL) or on the next Vercel ISR revalidation cycle.
 *
 * Auth: protected by AUDIT_SECRET env var (Bearer or ?secret= query param).
 * If AUDIT_SECRET is not set the endpoint is open (dev / staging).
 *
 * Body (JSON, optional):
 *   { "discovery": false }   → skip discovery suggestions (faster)
 *
 * Intended callers:
 *   - Admin dashboard "Actualizar snapshot" button
 *   - Post-repair cron job
 *   - Manual curl for debugging
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateIntelligenceReport } from '@/lib/catalog/intelligence'
import {
  buildSnapshot,
  saveIntelligenceSnapshot,
} from '@/lib/catalog/intelligence/snapshot'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const secret = process.env.AUDIT_SECRET
  if (secret) {
    const auth  = req.headers.get('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    const q     = req.nextUrl.searchParams.get('secret')
    if (token !== secret && q !== secret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let includeDiscovery = true
  try {
    const body = await req.text()
    if (body.trim()) {
      const parsed = JSON.parse(body) as { discovery?: boolean }
      if (parsed.discovery === false) includeDiscovery = false
    }
  } catch {
    // No body or invalid JSON — use defaults
  }

  // ── Generate + save ────────────────────────────────────────────────────────
  try {
    const report   = await generateIntelligenceReport({ includeDiscovery })
    const snapshot = buildSnapshot(report)
    saveIntelligenceSnapshot(snapshot)

    return NextResponse.json(
      {
        ok:          true,
        generatedAt: snapshot.generatedAt,
        products:    report.totalProducts,
        suppressed:  snapshot.suppressedIds.length,
        promoted:    snapshot.promotedIds.length,
        categories:  Object.keys(snapshot.categoryRankings).length,
        durationMs:  report.durationMs,
      },
      { status: 200 },
    )
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    )
  }
}
