/**
 * MercadoLibre Retailer Provider
 *
 * MercadoLibre is the dominant marketplace in Latin America and Colombia's
 * largest e-commerce platform by GMV. Including MercadoLibre enables
 * GOODPRICE to show Colombian users realistic local pricing alternatives
 * to Amazon imports.
 *
 * Affiliate program: MercadoLibre affiliates (via Awin network)
 * Primary market: mercadolibre.com.co (Colombia)
 * Pricing currency: COP (Colombian Peso)
 * Colombia shipping: Native (no import duties, local logistics)
 * Customs threshold: N/A (local transactions)
 *
 * External ID format: MercadoLibre Item ID
 * Pattern: MCO-[7-12 digits] or MCO[7-12 digits]
 * Example: MCO1234567890 or MCO-1234567890
 *
 * Price format: Colombian peso with period as thousands separator
 * Example: "$ 1.299.000" = 1,299,000 COP
 *
 * Key advantage: No import duties, faster shipping, local warranty support.
 * Key disadvantage: Often 30–60% more expensive than Amazon for tech products.
 *
 * Future fetch approach:
 *   Phase N+2: MercadoLibre Developers API (Items API)
 *   Endpoint: https://api.mercadolibre.com/items/{item_id}
 *   Auth: OAuth 2.0 app token (public read access)
 *   Rate limits: 3,000 requests/hour on free tier
 *   No scraping needed — official API available
 *
 * Official API docs: https://developers.mercadolibre.com.co/
 */

import type { RetailerProvider } from './types'
import type {
  Retailer,
  AvailabilityStatus,
  NormalizedRetailerProduct,
  RawRetailerData,
  ValidationResult,
} from '../types'
import type { MLItemResponse } from '../ml/types'
import { normalizeMLItem } from '../ml/normalizer'

const ML_RETAILER: Retailer = {
  id: 'mercadolibre',
  name: 'MercadoLibre',
  slug: 'mercadolibre',
  baseUrl: 'https://www.mercadolibre.com.co',
  countries: ['CO'],
  currency: 'COP',
  affiliateSupport: true,
  affiliateTag: undefined, // TODO: set after affiliate program approval
  logoUrl: '/logos/mercadolibre.svg',
  shipsToColombiaDirectly: true,
  shippingEstimateDays: { min: 1, max: 7 },
  estimatedShippingCostUSD: 0, // free shipping common on ML
  colombiaCustomsThresholdUSD: undefined, // N/A — local transactions
}

/**
 * MercadoLibre availability strings (Spanish).
 * From ML product API "status" and "available_quantity" fields.
 */
const ML_AVAILABILITY_MAP: Record<string, AvailabilityStatus> = {
  'disponible':       'in_stock',
  'activo':           'in_stock',
  'active':           'in_stock',
  'sin stock':        'out_of_stock',
  'agotado':          'out_of_stock',
  'pausado':          'out_of_stock',  // seller paused listing
  'cerrado':          'out_of_stock',  // listing closed
  'últimas unidades': 'limited',
  'últimas':          'limited',
  'pocos disponibles':'limited',
  'preventa':         'preorder',
}

/** MercadoLibre Item ID — "MCO" prefix + 7–12 digits */
const ML_ITEM_ID_REGEX = /^MCO-?\d{7,12}$/i

export const mercadoLibreProvider: RetailerProvider = {
  retailer: ML_RETAILER,

  buildProductUrl(externalId: string): string {
    // Normalize: remove dash if present (MCO-123 → MCO123 for URL)
    const normalizedId = externalId.replace('-', '')
    return `https://articulo.mercadolibre.com.co/${normalizedId}`
  },

  buildAffiliateUrl(productUrl: string): string {
    // Affiliate URL structure is handled via Awin deep-link wrapper
    // Deferred: implement when affiliate account is set up
    // Future format: https://www.awin1.com/cread.php?awinmid=XXXXX&ued={encoded_url}
    return productUrl
  },

  buildSearchUrl(query: string): string {
    const encoded = encodeURIComponent(query)
    return `https://listado.mercadolibre.com.co/${encoded}`
  },

  normalizeAvailability(rawStatus: string): AvailabilityStatus {
    const lower = rawStatus.toLowerCase().trim()

    for (const [key, status] of Object.entries(ML_AVAILABILITY_MAP)) {
      if (lower.includes(key)) return status
    }

    // MercadoLibre API: if available_quantity > 0 → in_stock
    // This logic runs upstream before calling normalizeAvailability
    return 'unknown'
  },

  normalizePrice(rawPrice: string | number): number {
    if (typeof rawPrice === 'number') {
      return isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : NaN
    }

    // Colombian peso format: "$ 1.299.000" or "1.299.000"
    // Dots are thousands separators, comma is decimal (e.g. "1.299.000,50")
    const cleaned = rawPrice
      .replace(/[$\s]/g, '')      // remove currency symbol and spaces
      .replace(/\./g, '')         // remove thousands separators (dots)
      .replace(',', '.')          // convert decimal comma to dot

    const parsed = parseFloat(cleaned)
    return isFinite(parsed) && parsed >= 0 ? parsed : NaN
  },

  normalizeProduct(raw: RawRetailerData): NormalizedRetailerProduct | null {
    if (!raw.success || raw.error) return null
    if (!raw.rawJson) return null

    // raw.rawJson is an MLItemResponse from the ML Items API
    const item = raw.rawJson as MLItemResponse
    if (!item.id || !item.title || typeof item.price !== 'number') return null

    // Use a synchronous reference rate for the pure provider method.
    // getCOPtoUSDRate() is async; for synchronous normalizeProduct, we use
    // the module-level cached rate or fall back to the reference rate.
    // The async ingestion pipeline (ingest-ml.ts) passes a fresh rate directly
    // to normalizeMLItem() instead of going through this provider method.
    const FALLBACK_COP_PER_USD = 4_150
    return normalizeMLItem(item, FALLBACK_COP_PER_USD)
  },

  validateExternalId(externalId: string): boolean {
    return ML_ITEM_ID_REGEX.test(externalId)
  },

  validateProduct(product: NormalizedRetailerProduct): ValidationResult {
    const errors: string[]   = []
    const warnings: string[] = []

    if (!ML_ITEM_ID_REGEX.test(product.externalId)) {
      errors.push(`Invalid MercadoLibre Item ID: "${product.externalId}"`)
    }

    if (isNaN(product.price) || product.price <= 0) {
      errors.push(`Invalid price: ${product.price}`)
    }

    // COP sanity check: tech products typically > 100,000 COP
    if (product.currency === 'COP' && product.price < 100_000) {
      warnings.push(`Unusually low COP price: ${product.price} — verify currency`)
    }

    if (!product.url.includes('mercadolibre.com.co') && !product.url.includes('articulo.mercadolibre')) {
      errors.push(`URL does not match MercadoLibre domain: ${product.url}`)
    }

    return { isValid: errors.length === 0, errors, warnings }
  },
}
