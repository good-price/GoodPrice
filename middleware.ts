import { NextRequest, NextResponse } from 'next/server'

/**
 * Middleware — HTTP Basic Auth guard for /admin routes.
 *
 * Credential system:
 *   Username  : good_price  (fixed)
 *   Password  : GPddmmaaD   (daily-rotating, Bogota time)
 *
 *   Format examples:
 *     29 May 2026  → GP290526D
 *     01 Jan 2027  → GP010127D
 *
 * Development fallback (NODE_ENV === 'development'):
 *   username: dev  /  password: dev
 *
 * No env vars required — the password is derived from the current
 * Bogota date at authentication time (computed on every request).
 *
 * Edge Runtime safe: uses Intl.DateTimeFormat + atob() (Web APIs only).
 */

const ADMIN_USERNAME = 'good_price'
const ADMIN_REALM    = 'GOODPRICE Ops'

// ── Dynamic password ──────────────────────────────────────────────────────────

/**
 * Computes the valid admin password for the current Bogota calendar date.
 *
 * Format: GP{dd}{mm}{yy}D
 *   dd = zero-padded day
 *   mm = zero-padded month
 *   yy = 2-digit year
 *
 * Uses Intl.DateTimeFormat with timeZone: 'America/Bogota' so the password
 * rotates at midnight Colombia time regardless of where the server runs.
 */
function computeDynamicPassword(): string {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day:      '2-digit',
    month:    '2-digit',
    year:     '2-digit',
  })
  const parts = fmt.formatToParts(now)
  const get   = (type: string) => parts.find(p => p.type === type)?.value ?? '01'
  return `GP${get('day')}${get('month')}${get('year')}D`
}

// ── Auth validation ───────────────────────────────────────────────────────────

function isAuthorised(authHeader: string): boolean {
  if (!authHeader.startsWith('Basic ')) return false

  let username: string
  let password: string
  try {
    const decoded  = atob(authHeader.slice(6))
    const colonIdx = decoded.indexOf(':')
    username = colonIdx >= 0 ? decoded.slice(0, colonIdx)      : decoded
    password = colonIdx >= 0 ? decoded.slice(colonIdx + 1)     : ''
  } catch {
    return false // invalid base64
  }

  // Development convenience: dev / dev
  if (process.env.NODE_ENV === 'development') {
    if (username === 'dev' && password === 'dev') return true
  }

  // Production: fixed username + daily-rotating Bogota-time password
  return username === ADMIN_USERNAME && password === computeDynamicPassword()
}

// ── Route handler ─────────────────────────────────────────────────────────────

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Only guard /admin and its sub-routes
  if (!pathname.startsWith('/admin')) {
    return NextResponse.next()
  }

  if (isAuthorised(req.headers.get('authorization') ?? '')) {
    return NextResponse.next()
  }

  // Prompt the browser's native Basic Auth dialog
  return new NextResponse('Acceso denegado — GOODPRICE Ops requiere autenticación.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${ADMIN_REALM}", charset="UTF-8"`,
      'Content-Type':     'text/plain; charset=utf-8',
    },
  })
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
}
