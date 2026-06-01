/**
 * Gate 9: image_accessible
 *
 * HTTP gate — only runs after Gate 8 (image_not_placeholder) passes.
 *
 * Protocol:
 *   1. HEAD request — fast, no body download.
 *   2. If HEAD returns 403 or 405 (some CDNs block HEAD) → retry with GET.
 *   3. Pass only on HTTP 200 with a plausible content-type.
 *   4. Any error or timeout → FAIL (Zero Trust: unknown ≠ accessible).
 *
 * Timeout: 8 seconds per request.
 */

import type { CandidateRecord, GateResult } from '@/types'

const TIMEOUT_MS = 8_000
const VALID_CONTENT_TYPE_PREFIXES = ['image/', 'application/octet-stream']

async function tryHead(url: string): Promise<Response> {
  return fetch(url, {
    method:   'HEAD',
    signal:   AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GoodpriceTPE/1.0)',
      'Accept':     'image/*,*/*;q=0.8',
    },
  })
}

async function tryGet(url: string): Promise<Response> {
  return fetch(url, {
    method:   'GET',
    signal:   AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GoodpriceTPE/1.0)',
      'Accept':     'image/*,*/*;q=0.8',
      'Range':      'bytes=0-1023',  // fetch only the first 1KB to confirm existence
    },
  })
}

function isValidContentType(contentType: string | null): boolean {
  if (!contentType) return true  // missing Content-Type on CDN → assume OK
  return VALID_CONTENT_TYPE_PREFIXES.some(p => contentType.startsWith(p))
}

export async function runImageAccessible(
  candidate: CandidateRecord,
  now: string,
): Promise<GateResult> {
  const start = Date.now()
  const { image } = candidate

  try {
    // ── Step 1: HEAD ────────────────────────────────────────────────────────
    const headRes = await tryHead(image)

    if (headRes.ok) {
      const ct = headRes.headers.get('content-type')
      if (!isValidContentType(ct)) {
        return {
          gateId:     'image_accessible',
          passed:     false,
          checkedAt:  now,
          httpStatus: headRes.status,
          detail:     `HTTP ${headRes.status} but Content-Type "${ct}" is not an image`,
          durationMs: Date.now() - start,
        }
      }
      return {
        gateId:     'image_accessible',
        passed:     true,
        checkedAt:  now,
        httpStatus: headRes.status,
        durationMs: Date.now() - start,
      }
    }

    // ── Step 2: HEAD failed — try GET if the method might be blocked ────────
    if (headRes.status === 403 || headRes.status === 405) {
      const getRes = await tryGet(image)
      const ct = getRes.headers.get('content-type')

      if (getRes.ok && isValidContentType(ct)) {
        return {
          gateId:     'image_accessible',
          passed:     true,
          checkedAt:  now,
          httpStatus: getRes.status,
          detail:     `HEAD returned ${headRes.status}, GET fallback succeeded`,
          durationMs: Date.now() - start,
        }
      }
      return {
        gateId:     'image_accessible',
        passed:     false,
        checkedAt:  now,
        httpStatus: getRes.status,
        detail:     `HEAD ${headRes.status}, GET fallback ${getRes.status}`,
        durationMs: Date.now() - start,
      }
    }

    // ── Step 3: Definitive failure (404, 410, 5xx, etc.) ───────────────────
    return {
      gateId:     'image_accessible',
      passed:     false,
      checkedAt:  now,
      httpStatus: headRes.status,
      detail:     `HTTP ${headRes.status} — image not accessible`,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = msg.includes('TimeoutError') || msg.includes('timeout') || msg.includes('abort')
    return {
      gateId:    'image_accessible',
      passed:    false,
      checkedAt: now,
      detail:    isTimeout
        ? `timeout after ${TIMEOUT_MS / 1000}s — image CDN unreachable`
        : `network error: ${msg.slice(0, 120)}`,
      durationMs: Date.now() - start,
    }
  }
}
