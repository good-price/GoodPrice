/**
 * GOODPRICE Audit — Image Validator
 *
 * Issues a lightweight HEAD request to each product image URL to verify:
 *   - The URL is reachable (2xx response)
 *   - The response Content-Type is an image MIME type
 *
 * Amazon CDN images (ssl-images-amazon.com) typically return 200 with no auth.
 * A 403 or 404 indicates the image has been removed or the URL is wrong.
 *
 * Timeout: 8 seconds (images can be on slow CDNs)
 * No in-memory cache — each audit run re-checks freshness.
 */

import type { ImageCheckResult, AuditSeverity } from '../types'

const IMAGE_CHECK_TIMEOUT_MS = 8_000
const IMAGE_MIME_PREFIXES     = ['image/', 'application/octet-stream']

/** Run a full image audit for a single product */
export async function auditImage(
  productId: string,
  imageUrl: string
): Promise<ImageCheckResult> {
  const checkedAt = new Date().toISOString()
  const notes: string[] = []

  // ── Basic URL sanity ──────────────────────────────────────────────────────

  if (!imageUrl || !imageUrl.startsWith('http')) {
    notes.push(`URL de imagen inválida o vacía: "${imageUrl}"`)
    return {
      productId,
      imageUrl,
      accessible:  false,
      checkedAt,
      severity:    'critical',
      notes,
    }
  }

  // ── HEAD request ──────────────────────────────────────────────────────────

  let accessible    = false
  let httpStatus:   number | undefined
  let contentType:  string | undefined
  let error:        string | undefined
  let severity:     AuditSeverity = 'ok'

  try {
    const res = await fetch(imageUrl, {
      method:  'HEAD',
      signal:  AbortSignal.timeout(IMAGE_CHECK_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GoodpriceAuditBot/1.0)',
      },
      redirect: 'follow',
    })

    httpStatus  = res.status
    contentType = res.headers.get('content-type') ?? undefined

    if (res.ok) {
      // Check that it's actually an image content type
      const isImage = contentType
        ? IMAGE_MIME_PREFIXES.some(prefix => contentType!.startsWith(prefix))
        : true  // no content-type header → assume ok (common on CDNs)

      if (isImage) {
        accessible = true
        severity   = 'ok'
        notes.push(`Imagen accesible (HTTP ${httpStatus}${contentType ? `, ${contentType}` : ''})`)
      } else {
        accessible = false
        severity   = 'warning'
        notes.push(`URL devuelve HTTP ${httpStatus} pero Content-Type es "${contentType}" — no es una imagen válida`)
      }
    } else if (res.status === 403) {
      // CDN-level block — might still work in browser (referer checks)
      accessible = false
      severity   = 'warning'
      notes.push(`HTTP 403 Forbidden — CDN puede requerir Referer de Amazon; verificar manualmente`)
    } else if (res.status === 404) {
      accessible = false
      severity   = 'critical'
      notes.push(`HTTP 404 — imagen eliminada del CDN de Amazon`)
    } else {
      accessible = false
      severity   = 'warning'
      notes.push(`HTTP ${httpStatus} inesperado desde el CDN de imagen`)
    }
  } catch (err) {
    accessible = false
    severity   = 'warning'
    error      = err instanceof Error ? err.message : String(err)

    if (error.includes('TimeoutError') || error.includes('timeout')) {
      notes.push(`Timeout (>${IMAGE_CHECK_TIMEOUT_MS / 1000}s) al verificar imagen — CDN lento o inaccesible`)
    } else {
      notes.push(`Error de red al verificar imagen: ${error}`)
    }
  }

  return {
    productId,
    imageUrl,
    accessible,
    httpStatus,
    contentType,
    checkedAt,
    error,
    severity,
    notes,
  }
}
