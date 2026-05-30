/**
 * Éxito Retailer Provider
 *
 * Grupo Éxito is one of Colombia's largest retail groups, operating
 * the Éxito, Carulla, and Surtimax brands. Its e-commerce platform
 * (exito.com) serves as a major electronics competitor in Colombia.
 *
 * Parent company: Grupo Casino (France) — recent acquisition by Calleja Group
 * Affiliate program: Éxito Afiliados (direct program)
 * Primary market: exito.com (Colombia)
 * Pricing currency: COP
 *
 * Price complexity note:
 * Éxito shows:
 *   1. Precio regular  — full retail price
 *   2. Precio Puntos Colombia — with loyalty points discount
 *   3. Precio tarjeta — with Éxito credit card
 * GOODPRICE captures "precio regular" or the lowest publicly available price.
 *
 * External ID format: Éxito SKU
 * Example: "28870" (numeric, variable length 4–8 digits)
 * Also: slug in URL like "mouse-logitech-mx-master-3s/p/28870"
 *
 * Future fetch approach:
 *   Phase N+2: HTML scraping
 *   Key insight: Éxito product pages embed VTEX store framework data
 *   in window.__RUNTIME__ and window.__STATE__ JS globals —
 *   these contain structured product data that's more reliable than CSS selectors
 *
 * URL pattern:
 *   Product: https://www.exito.com/[slug]/p?sc=11
 *   Search: https://www.exito.com/s?q=[query]&category=[cat_id]
 */

import type { RetailerProvider } from './types'
import type {
  Retailer,
  AvailabilityStatus,
  NormalizedRetailerProduct,
  RawRetailerData,
  ValidationResult,
} from '../types'

const EXITO_RETAILER: Retailer = {
  id: 'exito',
  name: 'Éxito',
  slug: 'exito',
  baseUrl: 'https://www.exito.com',
  countries: ['CO'],
  currency: 'COP',
  affiliateSupport: false, // TODO: set up affiliate program
  logoUrl: '/logos/exito.svg',
  shipsToColombiaDirectly: true,
  shippingEstimateDays: { min: 1, max: 5 },
  estimatedShippingCostUSD: 0,
  colombiaCustomsThresholdUSD: undefined,
}

const EXITO_AVAILABILITY_MAP: Record<string, AvailabilityStatus> = {
  'disponible':           'in_stock',
  'en stock':             'in_stock',
  'agregar al carrito':   'in_stock',   // "Add to cart" button
  'agotado':              'out_of_stock',
  'sin stock':            'out_of_stock',
  'no disponible':        'out_of_stock',
  'pocas unidades':       'limited',
  'preventa':             'preorder',
  'próximamente':         'preorder',
}

/** Éxito SKU — 4 to 8 digit numeric string */
const EXITO_SKU_REGEX = /^\d{4,8}$/

export const exitoProvider: RetailerProvider = {
  retailer: EXITO_RETAILER,

  buildProductUrl(externalId: string): string {
    // Éxito URLs require the slug + SKU; we use the SKU-based canonical form
    return `https://www.exito.com/p/${externalId}`
  },

  buildAffiliateUrl(productUrl: string): string {
    // Future: Éxito affiliate deep-link implementation
    // UTM parameters for attribution tracking (non-revenue, just analytics):
    // ?utm_source=goodprice&utm_medium=affiliate&utm_campaign=price_comparison
    return productUrl
  },

  buildSearchUrl(query: string): string {
    const encoded = encodeURIComponent(query)
    return `https://www.exito.com/s?q=${encoded}`
  },

  normalizeAvailability(rawStatus: string): AvailabilityStatus {
    const lower = rawStatus.toLowerCase().trim()

    for (const [key, status] of Object.entries(EXITO_AVAILABILITY_MAP)) {
      if (lower.includes(key)) return status
    }

    return 'unknown'
  },

  normalizePrice(rawPrice: string | number): number {
    if (typeof rawPrice === 'number') {
      return isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : NaN
    }

    // COP format same as other Colombian retailers
    const cleaned = rawPrice
      .replace(/[$\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')

    const parsed = parseFloat(cleaned)
    return isFinite(parsed) && parsed >= 0 ? parsed : NaN
  },

  normalizeProduct(raw: RawRetailerData): NormalizedRetailerProduct | null {
    // Phase N+2: parse Éxito product page
    // Preferred approach: extract from VTEX store data
    //
    // VTEX data extraction pattern (runs in browser context):
    //   const runtime = window.__RUNTIME__
    //   const state = window.__STATE__
    //   const product = state['Product'][skuId]
    //
    // Key fields in VTEX product object:
    //   product.productName  → title
    //   product.items[0].sellers[0].commertialOffer.Price  → price (COP)
    //   product.items[0].sellers[0].commertialOffer.IsAvailable  → availability
    //   product.items[0].images[0].imageUrl  → image
    if (!raw.success || raw.error) return null
    return null
  },

  validateExternalId(externalId: string): boolean {
    return EXITO_SKU_REGEX.test(externalId)
  },

  validateProduct(product: NormalizedRetailerProduct): ValidationResult {
    const errors: string[]   = []
    const warnings: string[] = []

    if (!product.price || product.price <= 0) {
      errors.push(`Invalid price: ${product.price}`)
    }

    if (!product.url.includes('exito.com')) {
      errors.push(`URL does not match Éxito domain: ${product.url}`)
    }

    if (product.currency === 'COP' && product.price < 50_000) {
      warnings.push(`Unexpectedly low COP price: ${product.price}`)
    }

    return { isValid: errors.length === 0, errors, warnings }
  },
}
