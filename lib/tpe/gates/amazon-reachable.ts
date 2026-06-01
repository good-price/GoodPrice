/**
 * Gate 7: amazon_reachable
 *
 * Checks that the Amazon product page exists and is reachable.
 *
 * Protocol (Zero Trust + GET fallback for 405):
 *   HEAD → 200/30x  → PASS  (page exists)
 *   HEAD → 404      → FAIL  (product definitely gone)
 *   HEAD → 405      → GET fallback (some ASINs block HEAD method)
 *     GET → 200/30x → PASS
 *     GET → 404     → FAIL
 *     GET → other   → FAIL
 *   HEAD → timeout  → FAIL  (unknown ≠ reachable)
 *   HEAD → 5xx/other → FAIL (unknown ≠ reachable)
 *
 * Rationale for 405 fallback:
 *   HTTP 405 Method Not Allowed means the resource exists but HEAD is blocked.
 *   Amazon blocks HEAD for certain ASINs (older listings, category-specific rules).
 *   This is a server-side method restriction, NOT a product absence signal.
 *   GET is the authoritative fallback — if it returns 200, the product exists.
 *
 * Zero Trust is preserved: timeout and all other errors remain FAIL.
 * Only 405 earns a second attempt — every other failure is definitive.
 *
 * Timeout: 8 seconds per request.
 */

import type { CandidateRecord, GateResult } from '@/types'

const TIMEOUT_MS         = 8_000
const AMAZON_PRODUCT_URL = (asin: string) => `https://www.amazon.com/dp/${asin}`

const BROWSER_HEADERS = {
  'Accept':          'text/html,application/xhtml+xml,*/*',
  'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function headRequest(url: string): Promise<Response> {
  return fetch(url, {
    method:   'HEAD',
    signal:   AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers:  BROWSER_HEADERS,
  })
}

async function getRequest(url: string): Promise<{ status: number; durationMs: number }> {
  const start = Date.now()
  const res = await fetch(url, {
    method:   'GET',
    signal:   AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers:  BROWSER_HEADERS,
  })
  // Cancel body immediately — we only need the status code, not the page HTML
  await res.body?.cancel()
  return { status: res.status, durationMs: Date.now() - start }
}

function isSuccess(status: number): boolean {
  return status === 200 || (status >= 300 && status < 400)
}

// ── Public gate function ──────────────────────────────────────────────────────

export async function runAmazonReachable(
  candidate: CandidateRecord,
  now: string,
): Promise<GateResult> {
  const start = Date.now()
  const url   = AMAZON_PRODUCT_URL(candidate.asin)

  try {
    // ── Step 1: HEAD ──────────────────────────────────────────────────────────
    const headRes = await headRequest(url)

    // Definitive pass
    if (isSuccess(headRes.status)) {
      return {
        gateId:     'amazon_reachable',
        passed:     true,
        checkedAt:  now,
        httpStatus: headRes.status,
        durationMs: Date.now() - start,
      }
    }

    // Definitive fail — product does not exist
    if (headRes.status === 404) {
      return {
        gateId:     'amazon_reachable',
        passed:     false,
        checkedAt:  now,
        httpStatus: 404,
        detail:     `Amazon returned 404 — product page does not exist for ASIN ${candidate.asin}`,
        durationMs: Date.now() - start,
      }
    }

    // ── Step 2: GET fallback for 405 (HEAD method blocked) ────────────────────
    if (headRes.status === 405) {
      try {
        const { status: getStatus } = await getRequest(url)

        if (isSuccess(getStatus)) {
          return {
            gateId:     'amazon_reachable',
            passed:     true,
            checkedAt:  now,
            httpStatus: getStatus,
            detail:     `HEAD 405 (method blocked), GET fallback ${getStatus} — product exists`,
            durationMs: Date.now() - start,
          }
        }

        if (getStatus === 404) {
          return {
            gateId:     'amazon_reachable',
            passed:     false,
            checkedAt:  now,
            httpStatus: getStatus,
            detail:     `HEAD 405, GET fallback 404 — product page does not exist for ASIN ${candidate.asin}`,
            durationMs: Date.now() - start,
          }
        }

        return {
          gateId:     'amazon_reachable',
          passed:     false,
          checkedAt:  now,
          httpStatus: getStatus,
          detail:     `HEAD 405, GET fallback ${getStatus} — unknown state (Zero Trust: fail)`,
          durationMs: Date.now() - start,
        }
      } catch (getFallbackErr) {
        const msg = getFallbackErr instanceof Error ? getFallbackErr.message : String(getFallbackErr)
        const isTimeout = msg.includes('TimeoutError') || msg.includes('timeout') || msg.includes('abort')
        return {
          gateId:     'amazon_reachable',
          passed:     false,
          checkedAt:  now,
          httpStatus: 405,
          detail:     isTimeout
            ? `HEAD 405, GET fallback timeout after ${TIMEOUT_MS / 1000}s (Zero Trust: fail)`
            : `HEAD 405, GET fallback network error: ${msg.slice(0, 80)}`,
          durationMs: Date.now() - start,
        }
      }
    }

    // ── Step 3: All other non-success, non-404, non-405 → FAIL ───────────────
    return {
      gateId:     'amazon_reachable',
      passed:     false,
      checkedAt:  now,
      httpStatus: headRes.status,
      detail:     `HTTP ${headRes.status} from Amazon — unknown state (Zero Trust: fail)`,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = msg.includes('TimeoutError') || msg.includes('timeout') || msg.includes('abort')
    return {
      gateId:    'amazon_reachable',
      passed:    false,
      checkedAt: now,
      detail:    isTimeout
        ? `timeout after ${TIMEOUT_MS / 1000}s — Amazon unreachable (Zero Trust: timeout = fail)`
        : `network error: ${msg.slice(0, 120)}`,
      durationMs: Date.now() - start,
    }
  }
}
