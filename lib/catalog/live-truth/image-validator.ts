/**
 * lib/catalog/live-truth/image-validator.ts
 *
 * Validates the product image extracted from Amazon against the catalog's
 * stored image URL. No network requests — purely structural URL analysis.
 *
 * Score (max 10):
 *   Same Amazon CDN domain + same ASIN in path → 10 pts (likely same image)
 *   Different URL but still Amazon CDN          → 7 pts  (updated image, same product)
 *   Image extracted but non-Amazon URL         → 5 pts  (suspicious)
 *   No image extracted from live page          → 4 pts  (neutral — parser miss)
 *   Different ASIN embedded in URL             → 2 pts  (strong drift signal)
 *
 * Image drift (hasImageDrift) is flagged when the live URL embeds a different
 * ASIN than the catalog ASIN. This can indicate that the ASIN now resolves to
 * a different product variant or an entirely different item.
 */

import type { ImageValidation } from './types'

const MAX_SCORE = 10

// Amazon CDN hostname patterns
const AMAZON_CDN_HOSTS = [
  'm.media-amazon.com',
  'images-na.ssl-images-amazon.com',
  'images-eu.ssl-images-amazon.com',
  'images-fe.ssl-images-amazon.com',
  'ecx.images-amazon.com',
]

function isAmazonCdnUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return AMAZON_CDN_HOSTS.some(h => hostname.includes(h))
  } catch {
    return false
  }
}

/** Extract the ASIN embedded in an Amazon image URL (10-char alphanumeric) */
function extractAsinFromImageUrl(url: string): string | null {
  const m = url.match(/\/([A-Z0-9]{10})[._/]/)
  return m?.[1] ?? null
}

export function validateImage(
  catalogImageUrl: string,
  catalogAsin:     string,
  liveImageUrl:    string | undefined,
): ImageValidation {
  if (!liveImageUrl) {
    return {
      score:      4,
      hasImage:   false,
      urlChanged: false,
      reason:     'Imagen no extraída — sin penalización',
    }
  }

  const catalogIsAmazon = isAmazonCdnUrl(catalogImageUrl)
  const liveIsAmazon    = isAmazonCdnUrl(liveImageUrl)

  // Extract ASINs from both URLs to detect product substitution
  const catalogAsinInImg = extractAsinFromImageUrl(catalogImageUrl)
  const liveAsinInImg    = extractAsinFromImageUrl(liveImageUrl)

  // If ASINs in image URLs differ and neither matches our catalog ASIN → strong drift
  const mismatchedAsin =
    liveAsinInImg !== null &&
    catalogAsinInImg !== null &&
    liveAsinInImg !== catalogAsinInImg &&
    liveAsinInImg !== catalogAsin.toUpperCase()

  if (mismatchedAsin) {
    return {
      score:      2,
      hasImage:   true,
      urlChanged: true,
      reason:     `ASIN de imagen cambió: catálogo=${catalogAsinInImg} live=${liveAsinInImg} — posible sustitución de producto`,
    }
  }

  // Same URL → perfect
  if (liveImageUrl === catalogImageUrl) {
    return {
      score:      MAX_SCORE,
      hasImage:   true,
      urlChanged: false,
      reason:     'Imagen idéntica a catálogo',
    }
  }

  // Different URL, both Amazon CDN → updated image, same product likely
  if (liveIsAmazon && catalogIsAmazon) {
    return {
      score:      7,
      hasImage:   true,
      urlChanged: true,
      reason:     'Imagen de Amazon CDN actualizada (probable recorte/resolución)',
    }
  }

  // Live is Amazon CDN but catalog is not (or vice versa) → acceptable
  if (liveIsAmazon) {
    return {
      score:      6,
      hasImage:   true,
      urlChanged: true,
      reason:     'Imagen en Amazon CDN pero URL distinta a catálogo',
    }
  }

  // Non-Amazon URL → suspicious
  return {
    score:      5,
    hasImage:   true,
    urlChanged: true,
    reason:     'Imagen en dominio no-Amazon — revisar',
  }
}
