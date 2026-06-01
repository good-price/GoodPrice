/**
 * lib/tpe/recovery/image-swap.ts
 *
 * CDN swap logic for Tier 1 image recovery.
 *
 * Amazon migrated product images from the deprecated images-na CDN to
 * m.media-amazon.com. The image hash (/images/I/{hash}) is preserved
 * across the migration — only the hostname changes.
 *
 * This module is PURE: no I/O, no side effects, no imports from @/types.
 * It can be tested without any infrastructure.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const LEGACY_CDN_HOST  = 'images-na.ssl-images-amazon.com'
export const CURRENT_CDN_HOST = 'm.media-amazon.com'
export const I_FORMAT_PATH    = '/images/I/'

// ── Detection ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the URL uses the deprecated images-na CDN with /images/I/ format.
 * These are the candidates for a direct CDN hostname swap.
 */
export function isLegacyICdnUrl(url: string | undefined): boolean {
  if (!url) return false
  return url.includes(LEGACY_CDN_HOST) && url.includes(I_FORMAT_PATH)
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Build the m.media-amazon.com equivalent of a legacy images-na /I/ URL.
 * Returns null if the URL is not a legacy /I/ format (not applicable).
 *
 * Preserves the full path after the hostname: hash, variant suffix, extension.
 *
 * Example:
 *   input:  https://images-na.ssl-images-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg
 *   output: https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SL1500_.jpg
 */
export function buildSwappedUrl(url: string): string | null {
  if (!isLegacyICdnUrl(url)) return null
  return url.replace(LEGACY_CDN_HOST, CURRENT_CDN_HOST)
}

/**
 * Extract the image hash from an /images/I/ URL (both legacy and current).
 * Returns the hash string (e.g. "61SUj2aKoEL") or null if not applicable.
 * Used for debugging and logging.
 */
export function extractImageHash(url: string): string | null {
  const match = /\/images\/I\/([^._]+)/.exec(url)
  return match ? match[1] : null
}
