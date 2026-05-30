/**
 * Falabella Retailer Provider
 *
 * Falabella is a major South American retailer with significant presence
 * in Colombia. It competes directly with Alkosto in electronics and
 * frequently offers CMR card discounts that complicate price comparison.
 *
 * Affiliate program: Falabella Affiliados (via TradeTracker or direct)
 * Primary market: falabella.com.co (Colombia)
 * Pricing currency: COP
 *
 * Price complexity note:
 * Falabella shows multiple prices:
 *   1. Precio normal    — base price
 *   2. Precio CMR       — with CMR credit card discount (typically 10–20% off)
 *   3. Precio internet  — online-only price
 * GOODPRICE captures "precio internet" as the fair comparison price.
 *
 * External ID format: Falabella product ID
 * Example: "881627001" (numeric, 9 digits)
 * Also: SKU in URL path like "mouse-logitech-mx-master-3s/p/881627001"
 *
 * Future fetch approach:
 *   Phase N+2: HTML scraping + structured data extraction
 *   Falabella embeds JSON-LD Product schema on product pages —
 *   this is the preferred extraction target (more stable than CSS selectors)
 *   Target: <script type="application/ld+json"> with @type: "Product"
 *
 * URL pattern:
 *   Product: https://www.falabella.com.co/falabella-co/product/[id]/[slug]/[id]
 *   Search: https://www.falabella.com.co/falabella-co/search?Ntt=[query]
 */

import type { RetailerProvider } from './types'
import type {
  Retailer,
  AvailabilityStatus,
  NormalizedRetailerProduct,
  RawRetailerData,
  ValidationResult,
} from '../types'

const FALABELLA_RETAILER: Retailer = {
  id: 'falabella',
  name: 'Falabella',
  slug: 'falabella',
  baseUrl: 'https://www.falabella.com.co',
  countries: ['CO'],
  currency: 'COP',
  affiliateSupport: false, // TODO: verify affiliate program status
  logoUrl: '/logos/falabella.svg',
  shipsToColombiaDirectly: true,
  shippingEstimateDays: { min: 1, max: 7 },
  estimatedShippingCostUSD: 0,
  colombiaCustomsThresholdUSD: undefined,
}

const FALABELLA_AVAILABILITY_MAP: Record<string, AvailabilityStatus> = {
  'disponible':           'in_stock',
  'agregar al carro':     'in_stock',   // "Add to cart" button present
  'en stock':             'in_stock',
  'agotado':              'out_of_stock',
  'sin stock':            'out_of_stock',
  'no disponible':        'out_of_stock',
  'pocas unidades':       'limited',
  'últimas unidades':     'limited',
  'preventa':             'preorder',
}

/** Falabella product ID — 9 to 12 digit numeric */
const FALABELLA_ID_REGEX = /^\d{7,12}$/

export const falabellaProvider: RetailerProvider = {
  retailer: FALABELLA_RETAILER,

  buildProductUrl(externalId: string): string {
    // Falabella URLs use the pattern /product/[id]/[slug]/[id]
    // We simplify to the minimal working form using just the product ID
    return `https://www.falabella.com.co/falabella-co/product/${externalId}`
  },

  buildAffiliateUrl(productUrl: string): string {
    // Future: implement when affiliate program credentials are available
    // TradeTracker deep-link format:
    // https://tc.tradetracker.net/?c=[campaign_id]&m=[material_id]&u=[encoded_url]
    return productUrl
  },

  buildSearchUrl(query: string): string {
    const encoded = encodeURIComponent(query)
    return `https://www.falabella.com.co/falabella-co/search?Ntt=${encoded}`
  },

  normalizeAvailability(rawStatus: string): AvailabilityStatus {
    const lower = rawStatus.toLowerCase().trim()

    for (const [key, status] of Object.entries(FALABELLA_AVAILABILITY_MAP)) {
      if (lower.includes(key)) return status
    }

    return 'unknown'
  },

  normalizePrice(rawPrice: string | number): number {
    if (typeof rawPrice === 'number') {
      return isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : NaN
    }

    // Falabella COP format: "$ 1.299.000" or "1.299.000"
    // Note: we capture "precio internet" — see file header for multi-price context
    const cleaned = rawPrice
      .replace(/[$\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')

    const parsed = parseFloat(cleaned)
    return isFinite(parsed) && parsed >= 0 ? parsed : NaN
  },

  normalizeProduct(raw: RawRetailerData): NormalizedRetailerProduct | null {
    // Phase N+2: parse Falabella product page
    // Preferred approach: extract JSON-LD Product schema from page
    // <script type="application/ld+json">
    //   { "@type": "Product", "name": ..., "offers": { "price": ..., ... } }
    // </script>
    //
    // Key price selection rule:
    //   If multiple offers exist, select the "Precio internet" offer.
    //   Ignore "Precio CMR" — requires credit card not available to all users.
    if (!raw.success || raw.error) return null
    return null
  },

  validateExternalId(externalId: string): boolean {
    return FALABELLA_ID_REGEX.test(externalId)
  },

  validateProduct(product: NormalizedRetailerProduct): ValidationResult {
    const errors: string[]   = []
    const warnings: string[] = []

    if (!product.price || product.price <= 0) {
      errors.push(`Invalid price: ${product.price}`)
    }

    if (!product.url.includes('falabella.com.co')) {
      errors.push(`URL does not match Falabella domain: ${product.url}`)
    }

    if (product.currency === 'COP' && product.price < 50_000) {
      warnings.push(`Unexpectedly low COP price: ${product.price} — check price type`)
    }

    return { isValid: errors.length === 0, errors, warnings }
  },
}
