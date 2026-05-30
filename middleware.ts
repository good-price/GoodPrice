/**
 * middleware.ts
 *
 * Session-cookie guard for all /admin/* routes.
 *
 * Replaces the previous HTTP Basic Auth implementation.
 * Cookie: gp-admin — HttpOnly, Secure, SameSite=Lax, Path=/admin, 8h TTL
 * Token:  stateless HMAC-SHA256 signed payload (see lib/admin/session.ts)
 *
 * Login page (/admin/login) is always accessible — it is the auth entry point.
 * Unauthenticated requests are redirected to /admin/login?next=<original-path>.
 *
 * Required env var:
 *   ADMIN_SESSION_SECRET  — random string ≥ 32 chars (set in Vercel dashboard)
 *
 * Edge Runtime safe: Web Crypto API only (no Node.js).
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, COOKIE_NAME }  from '@/lib/admin/session'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Login page is always accessible — never gate the gate itself
  if (pathname === '/admin/login') return NextResponse.next()

  // Verify the session cookie
  const token   = req.cookies.get(COOKIE_NAME)?.value ?? ''
  const session = token ? await verifyToken(token) : null

  if (session) return NextResponse.next()

  // No valid session → redirect to login, preserving the target URL
  const loginUrl = new URL('/admin/login', req.url)
  loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
}
