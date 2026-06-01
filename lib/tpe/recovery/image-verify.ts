/**
 * lib/tpe/recovery/image-verify.ts
 *
 * HTTP verification for candidate image URLs during recovery.
 *
 * Protocol: HEAD first, GET fallback if HEAD is blocked (403/405).
 * Only a confirmed HTTP 200 with plausible content-type passes.
 * Timeout: 8 seconds. Any error or timeout = not accessible.
 *
 * Distinct from gates/image-accessible.ts (which returns a GateResult).
 * This module returns recovery-specific data for use in RecoveryMetadata.
 */

const TIMEOUT_MS = 8_000
const VALID_CONTENT_TYPE_PREFIXES = ['image/', 'application/octet-stream']

export interface ImageVerifyResult {
  accessible:   boolean
  httpStatus?:  number
  contentType?: string
  method:       'HEAD' | 'GET' | 'none'
  detail?:      string
  durationMs:   number
}

function isValidContentType(ct: string | null): boolean {
  if (!ct) return true  // absent Content-Type on CDN is acceptable
  return VALID_CONTENT_TYPE_PREFIXES.some(p => ct.startsWith(p))
}

async function headRequest(url: string): Promise<Response> {
  return fetch(url, {
    method:   'HEAD',
    signal:   AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GoodpriceRecovery/1.0)',
      'Accept':     'image/*,*/*;q=0.8',
    },
  })
}

async function getRequest(url: string): Promise<Response> {
  return fetch(url, {
    method:   'GET',
    signal:   AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GoodpriceRecovery/1.0)',
      'Accept':     'image/*,*/*;q=0.8',
      'Range':      'bytes=0-511',  // only first 512 bytes — confirm existence without full download
    },
  })
}

/**
 * Verify whether an image URL is accessible.
 * Returns structured data for use in ImageRecoveryAttempt.
 */
export async function verifyImageUrl(url: string): Promise<ImageVerifyResult> {
  const start = Date.now()

  try {
    // ── Step 1: HEAD ──────────────────────────────────────────────────────────
    const headRes = await headRequest(url)
    const ct = headRes.headers.get('content-type')

    if (headRes.ok && isValidContentType(ct)) {
      return {
        accessible:  true,
        httpStatus:  headRes.status,
        contentType: ct ?? undefined,
        method:      'HEAD',
        durationMs:  Date.now() - start,
      }
    }

    // HEAD returned non-OK: try GET fallback for 403/405 (CDN blocks HEAD)
    if (headRes.status === 403 || headRes.status === 405) {
      const getRes = await getRequest(url)
      const getCt = getRes.headers.get('content-type')

      if (getRes.ok && isValidContentType(getCt)) {
        return {
          accessible:  true,
          httpStatus:  getRes.status,
          contentType: getCt ?? undefined,
          method:      'GET',
          detail:      `HEAD ${headRes.status}, GET fallback succeeded`,
          durationMs:  Date.now() - start,
        }
      }

      return {
        accessible: false,
        httpStatus: getRes.status,
        method:     'GET',
        detail:     `HEAD ${headRes.status}, GET fallback ${getRes.status}`,
        durationMs: Date.now() - start,
      }
    }

    // Definitive failure (404, 410, 5xx, etc.)
    return {
      accessible: false,
      httpStatus: headRes.status,
      method:     'HEAD',
      detail:     `HTTP ${headRes.status}`,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = msg.includes('TimeoutError') || msg.includes('timeout') || msg.includes('abort')
    return {
      accessible: false,
      method:     'none',
      detail:     isTimeout
        ? `timeout after ${TIMEOUT_MS / 1000}s`
        : `network error: ${msg.slice(0, 100)}`,
      durationMs: Date.now() - start,
    }
  }
}
