/**
 * lib/admin/auth.ts
 *
 * Unified authorization helper for all /api/* admin routes.
 *
 * Accepts either:
 *   (a) Valid gp-admin session cookie  — requests from the admin UI panel
 *   (b) AUDIT_SECRET Bearer token      — cron jobs / external API callers
 *   (c) AUDIT_SECRET as ?secret= param — legacy query-string auth
 *
 * If AUDIT_SECRET is not configured (development), path (b)/(c) pass freely.
 *
 * Usage in any API route handler:
 *   import { isAdminRequest } from '@/lib/admin/auth'
 *   if (!(await isAdminRequest(req))) {
 *     return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
 *   }
 */

import type { NextRequest } from 'next/server'
import { verifyToken, COOKIE_NAME } from '@/lib/admin/session'

export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  // ── (a) Admin session cookie — browser requests from the UI panel ──────────
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (token) {
    const session = await verifyToken(token)
    if (session) return true
  }

  // ── (b)/(c) AUDIT_SECRET — cron jobs and external API callers ─────────────
  const secret = process.env.AUDIT_SECRET
  if (!secret) return true   // dev: open when AUDIT_SECRET is not set

  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const query  = req.nextUrl.searchParams.get('secret') ?? ''
  const body   = req.headers.get('x-audit-secret') ?? ''   // paapi/sync variant

  return bearer === secret || query === secret || body === secret
}
