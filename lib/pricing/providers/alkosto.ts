/**
 * Alkosto Retailer Provider
 *
 * Alkosto is Colombia's largest electronics and home appliances chain,
 * with both physical stores and a growing e-commerce presence.
 * It provides a critical benchmark for local Colombian retail pricing.
 *
 * Affiliate program: None (direct tracking via custom partner agreement)
 * Primary market: alkosto.com (Colombia only)
 * Pricing currency: COP
 * Colombia shipping: Native (free shipping on orders > 200,000 COP)
 *
 * External ID format: Alkosto SKU / product permalink slug
 * Example: "logitech-mouse-mx-master-3s-grafito-910-005647"
 * Pattern: kebab-case slug from URL path
 *
 * Price format: COP with period thousands separator
 * Example: "$1.299.000" or "1.299.000"
 *
 * Key advantage: Local warranty, physical stores for return/exchange,
 * no import risk, available in physical stores for immediate pickup.
 * Key disadvantage: Typically 30–80% more expensive than Amazon for tech.
 *
 * Future fetch approach:
 *   Phase N+2: HTML scraping of product pages
 *   Target selectors:
 *     Price:        .price-box .price
 *     Availability: .availability span / .stock-availability
 *     Title:        h1.product-name
 *   Note: Alkosto has anti-bot measures — requires respectful rate limiting
 *         and possibly residential proxy rotation in Phase N+3
 *
 * Alkosto URL patterns:
 *   Product: https://www.alkosto.com/[slug]/p
 *   Category: https://www.alkosto.com/[category]
 *   Search: https://www.alkosto.com/search?text=[query]
 */

import type { RetailerProvider } from './types'
import type {
  Retailer,
  AvailabilityStatus,
  NormalizedRetailerProduct,
  RawRetailerData,
  ValidationResult,
} from '../types'

const ALKOSTO_RETAILER: Retailer = {
  id: 'alkosto',
  name: 'Alkosto',
  slug: 'alkosto',
  baseUrl: 'https://www.alkosto.com',
  countries: ['CO'],
  currency: 'COP',
  affiliateSupport: false,
  logoUrl: '/logos/alkosto.svg',
  shipsToColombiaDirectly: true,
  shippingEstimateDays: { min: 1, max: 5 },
  estimatedShippingCostUSD: 0,
  colombiaCustomsThresholdUSD: undefined,
}

const ALKOSTO_AVAILABILITY_MAP: Record<string, AvailabilityStatus> = {
  'disponible':            'in_stock',
  'en stock':              'in_stock',
  'agotado':               'out_of_stock',
  'sin stock':             'out_of_stock',
  'no disponible':         'out_of_stock',
  'pocas unidades':        'limited',
  'últimas unidades':      'limited',
  'próximamente':          'preorder',
  'próxima llegada':       'preorder',
  'descontinuado':         'discontinued',
}

/** Alkosto SKU slug — kebab-case, ends with product code */
const ALKOSTO_SKU_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)+$/

export const alkostoProvider: RetailerProvider = {
  retailer: ALKOSTO_RETAILER,

  buildProductUrl(externalId: string): string {
    return `https://www.alkosto.com/${externalId}/p`
  },

  buildAffiliateUrl(productUrl: string): string {
    // Alkosto has no affiliate program currently
    // Future: implement UTM parameters for conversion tracking
    return productUrl
  },

  buildSearchUrl(query: string): string {
    const encoded = encodeURIComponent(query)
    return `https://www.alkosto.com/search?text=${encoded}`
  },

  normalizeAvailability(rawStatus: string): AvailabilityStatus {
    const lower = rawStatus.toLowerCase().trim()

    for (const [key, status] of Object.entries(ALKOSTO_AVAILABILITY_MAP)) {
      if (lower.includes(key)) return status
    }

    return 'unknown'
  },

  normalizePrice(rawPrice: string | number): number {
    if (typeof rawPrice === 'number') {
      return isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : NaN
    }

    // COP format with period separators: "$1.299.000" → 1299000
    const cleaned = rawPrice
      .replace(/[$\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')

    const parsed = parseFloat(cleaned)
    return isFinite(parsed) && parsed >= 0 ? parsed : NaN
  },

  normalizeProduct(raw: RawRetailerData): NormalizedRetailerProduct | null {
    // Phase N+2: parse Alkosto product page HTML
    // Future target selectors (from DOM inspection):
    //   - Price: document.querySelector('.price-box .price')?.textContent
    //   - Title: document.querySelector('h1.product-name')?.textContent
    //   - Stock: document.querySelector('.availability')?.textContent
    //   - Image: document.querySelector('.product-image-photo')?.src
    if (!raw.success || raw.error) return null
    return null
  },

  validateExternalId(externalId: string): boolean {
    return ALKOSTO_SKU_REGEX.test(externalId)
  },

  validateProduct(product: NormalizedRetailerProduct): ValidationResult {
    const errors: string[]   = []
    const warnings: string[] = []

    if (!product.price || product.price <= 0) {
      errors.push(`Invalid price: ${product.price}`)
    }

    // Alkosto sells in COP — prices typically 100,000 to 10,000,000 COP
    if (product.currency === 'COP') {
      if (product.price < 50_000) {
        warnings.push(`Unexpectedly low COP price: ${product.price}`)
      }
      if (product.price > 50_000_000) {
        warnings.push(`Unusually high COP price: ${product.price} — verify`)
      }
    }

    if (!product.url.includes('alkosto.com')) {
      errors.push(`URL does not match Alkosto domain: ${product.url}`)
    }

    return { isValid: errors.length === 0, errors, warnings }
  },
}
