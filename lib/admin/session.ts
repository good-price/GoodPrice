/**
 * lib/admin/session.ts
 *
 * Stateless session-token helpers for /admin authentication.
 *
 * Token format:  <payload_b64url>.<hmac_sha256_b64url>
 *   payload = JSON { sub: string, exp: number, iat: number }
 *
 * Edge Runtime compatible — uses Web Crypto API only (no Node.js crypto).
 * Called from middleware.ts (Edge) and app/api/admin/auth/route.ts (Node).
 *
 * Required env var:
 *   ADMIN_SESSION_SECRET  — random string ≥ 32 chars.
 *   Falls back to an insecure dev constant when not set (logs a warning).
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const COOKIE_NAME    = 'gp-admin'
export const COOKIE_MAX_AGE = 8 * 60 * 60   // 8 hours in seconds

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionPayload {
  sub: string   // username
  exp: number   // unix expiry timestamp
  iat: number   // unix issued-at timestamp
}

// ── Internals ─────────────────────────────────────────────────────────────────

function getSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET
  if (!s) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[session] ADMIN_SESSION_SECRET is not set. ' +
        'Using insecure dev fallback — never deploy without this env var.',
      )
    }
    return 'dev-secret-goodprice-internal-NOT-for-production'
  }
  return s
}

function b64urlEncode(input: string): string {
  return btoa(input)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function b64urlDecode(input: string): string {
  // Re-pad base64url → base64 then decode
  const pad    = '='.repeat((4 - (input.length % 4)) % 4)
  const base64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
  return atob(base64)
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function hmacSign(key: CryptoKey, data: string): Promise<string> {
  const buf   = await crypto.subtle.sign(
    'HMAC', key,
    new TextEncoder().encode(data),
  )
  const bytes = Array.from(new Uint8Array(buf))
  return b64urlEncode(String.fromCharCode(...bytes))
}

async function hmacVerify(key: CryptoKey, data: string, sigB64: string): Promise<boolean> {
  try {
    const decoded  = b64urlDecode(sigB64)
    const sigBytes = new Uint8Array(Array.from(decoded, c => c.charCodeAt(0)))
    return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data))
  } catch {
    return false
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates a signed session token for the given username.
 * Expires after COOKIE_MAX_AGE seconds.
 */
export async function signToken(username: string): Promise<string> {
  const now     = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = {
    sub: username,
    exp: now + COOKIE_MAX_AGE,
    iat: now,
  }
  const payloadB64 = b64urlEncode(JSON.stringify(payload))
  const key        = await importHmacKey(getSecret())
  const sig        = await hmacSign(key, payloadB64)
  return `${payloadB64}.${sig}`
}

/**
 * Verifies a session token.
 * Returns the payload if the signature is valid and the token hasn't expired.
 * Returns null for any failure (tampered, expired, malformed).
 */
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null

    const payloadB64 = token.slice(0, dot)
    const sigB64     = token.slice(dot + 1)
    if (!payloadB64 || !sigB64) return null

    const key   = await importHmacKey(getSecret())
    const valid = await hmacVerify(key, payloadB64, sigB64)
    if (!valid) return null

    const payload = JSON.parse(b64urlDecode(payloadB64)) as SessionPayload

    if (payload.exp < Math.floor(Date.now() / 1000)) return null

    return payload
  } catch {
    return null
  }
}
