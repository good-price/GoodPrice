/**
 * POST /api/catalog/intelligence/recompute
 *
 * Forces a fresh intelligence report computation and returns the result.
 * Identical to GET /api/catalog/intelligence/report but uses POST to
 * signal to callers that this triggers fresh computation (not cached).
 *
 * Body (JSON, optional):
 *   { "discovery": false }   → skip discovery suggestions (faster)
 *
 * Auth: protected by AUDIT_SECRET env var.
 *
 * Useful for:
 *   - Triggering post-repair re-evaluation
 *   - Admin dashboard "refresh" button
 *   - Cron job that runs after the repair pipeline
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateIntelligenceReport } from '@/lib/catalog/intelligence'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let includeDiscovery = true
  try {
    const body = await req.text()
    if (body.trim()) {
      const parsed = JSON.parse(body) as { discovery?: boolean }
      if (parsed.discovery === false) includeDiscovery = false
    }
  } catch {
    // No body — use defaults
  }

  try {
    const report = await generateIntelligenceReport({ includeDiscovery })

    return NextResponse.json(
      { ok: true, recomputed: true, ...report },
      { status: 200 },
    )
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    )
  }
}
