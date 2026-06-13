/**
 * app/api/admin/auth/route.ts
 *
 * POST /api/admin/auth  — validate credentials, issue session cookie
 * DELETE /api/admin/auth — clear session cookie (logout)
 *
 * Credential system (unchanged from Basic Auth):
 *   Username : good_price  (fixed)
 *   Password : GPddmmaaD   (daily-rotating, Bogota time)
 *   Dev      : dev / dev   (when NODE_ENV === 'development')
 */

import { NextRequest, NextResponse } from 'next/server'
import { signToken, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/admin/session'

// ── Credentials ───────────────────────────────────────────────────────────────

const ADMIN_USERNAME = 'good_price'

/** Identical to the function in the original middleware.ts. */
function computeDynamicPassword(): string {
  const now  = new Date()
  const fmt  = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day:      '2-digit',
    month:    '2-digit',
    year:     '2-digit',
  })
  const parts = fmt.formatToParts(now)
  const get   = (type: string) => parts.find(p => p.type === type)?.value ?? '01'
  return `GP${get('day')}${get('month')}${get('year')}D`
}

function isValidCredentials(username: string, password: string): boolean {
  if (process.env.NODE_ENV === 'development') {
    if (username === 'dev' && password === 'dev') return true
  }
  return username === ADMIN_USERNAME && password === computeDynamicPassword()
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path:     '/',
    maxAge,
  }
}

// ── Redirect target sanitisation ──────────────────────────────────────────────

/**
 * Accepts only /admin/* paths (excluding /admin/login itself) as redirect
 * targets, preventing open-redirect attacks via the ?next= parameter.
 */
function sanitiseNext(next: string): string {
  if (
    next.startsWith('/admin') &&
    !next.startsWith('/admin/login')
  ) {
    return next
  }
  return '/admin'
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/auth
 * Body (form-data): username, password, next
 *
 * On success: issues session cookie → redirects to `next`
 * On failure: redirects back to /admin/login?error=1
 */
export async function POST(req: NextRequest) {
  const form = await req.formData()

  const username = String(form.get('username') ?? '').trim()
  const password = String(form.get('password') ?? '')
  const next     = sanitiseNext(String(form.get('next') ?? '/admin'))

  if (!isValidCredentials(username, password)) {
    const loginUrl = new URL('/admin/login', req.url)
    loginUrl.searchParams.set('error', '1')
    if (next !== '/admin') loginUrl.searchParams.set('next', next)
    return NextResponse.redirect(loginUrl, { status: 303 })
  }

  const token    = await signToken(username)
  const response = NextResponse.redirect(new URL(next, req.url), { status: 303 })
  response.cookies.set(COOKIE_NAME, token, cookieOptions(COOKIE_MAX_AGE))
  return response
}

/**
 * DELETE /api/admin/auth
 * Clears the session cookie → redirects to /admin/login.
 * Called via fetch() from the Logout button in AdminShell.
 */
export async function DELETE(req: NextRequest) {
  const response = NextResponse.redirect(new URL('/admin/login', req.url), { status: 303 })
  response.cookies.set(COOKIE_NAME, '', cookieOptions(0))
  return response
}
