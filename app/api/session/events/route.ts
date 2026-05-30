/**
 * POST /api/session/events
 *
 * Receives anonymous aggregate session signals for admin analytics.
 * Called by useSessionProfile hook on each session init (fire-and-forget).
 *
 * Request body (JSON):
 *   topCategories   string[]   Top category slugs from session profile (max 5)
 *   isReturn        boolean    Whether this is a return visit
 *   hasWatchlist    boolean    Whether the user has watchlist items
 *
 * Privacy guarantees (enforced server-side):
 *   - Session ID is NOT accepted — the field is ignored if present
 *   - No IP address, user agent, or fingerprinting data stored
 *   - Only categorical signals (category slugs, boolean flags) are persisted
 *   - Stored in data/session/aggregate-signals.json (rolling, max 1000 entries)
 *
 * Response: { ok: boolean }
 *
 * Rate limiting: none — the signal is fire-and-forget and very cheap.
 * Malformed or missing body fields are handled gracefully (default values).
 */

import { NextRequest, NextResponse } from 'next/server'
import { appendSessionSignal } from '@/lib/session/reports'
import type { SessionSignal } from '@/lib/session/types'

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { /* no body */ }

  // ── Validate and sanitise — only accept categorical signals ───────────────
  const rawCats = Array.isArray(body.topCategories) ? body.topCategories : []
  const signal: SessionSignal = {
    topCategories: rawCats
      .filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length < 64)
      .slice(0, 5),
    isReturn:     body.isReturn     === true,
    hasWatchlist: body.hasWatchlist === true,
    ts:           Date.now(),
  }

  // ── Persist (best-effort — never throw on write failure) ──────────────────
  try {
    appendSessionSignal(signal)
  } catch {
    // Analytics write failure must never affect the user response
  }

  return NextResponse.json({ ok: true })
}
