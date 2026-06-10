/**
 * Amazon Retailer Provider
 *
 * Amazon is GOODPRICE's primary retailer — all current catalog products
 * are Amazon listings. This provider formalizes the Amazon-specific logic
 * that was previously scattered across the codebase.
 *
 * Affiliate program: Amazon Associates (tag: upgoodprice-20)
 * Primary market: amazon.com (ships internationally to Colombia)
 * Pricing currency: USD
 * Colombia shipping: Direct (7–21 days, free on orders $25+)
 * Customs threshold: $200 USD (DIAN import duty exemption)
 *
 * External ID format: ASIN — 10-character alphanumeric (B0CHWRXH8B)
 * Pattern: /^[A-Z0-9]{10}$/
 *
 * Future fetch approach:
 *   Phase N+2: Amazon Product Advertising API (PA-API 5.0)
 *   Requires: AWS access key + secret, PA-API approved account
 *   Rate limits: 8,640 requests/day on standard tier
 *   Batch support: GetItems API supports up to 10 ASINs per request
 */

import type { RetailerProvider } from './types'
import type {
  Retailer,
  AvailabilityStatus,
  NormalizedRetailerProduct,
  RawRetailerData,
  ValidationResult,
} from '../types'

// ── Retailer metadata ─────────────────────────────────────────────────────────

const AMAZON_RETAILER: Retailer = {
  id: 'amazon',
  name: 'Amazon',
  slug: 'amazon',
  baseUrl: 'https://www.amazon.com',
  countries: ['US'],
  currency: 'USD',
  affiliateSupport: true,
  affiliateTag: 'upgoodprice-20',
  logoUrl: '/logos/amazon.svg',
  shipsToColombiaDirectly: true,
  shippingEstimateDays: { min: 7, max: 21 },
  estimatedShippingCostUSD: 10, // average; free threshold varies by product
  colombiaCustomsThresholdUSD: 200,
}

// ── Availability string mappings ──────────────────────────────────────────────
// Sourced from Amazon's actual product page availability strings (EN)

const AMAZON_AVAILABILITY_MAP: Record<string, AvailabilityStatus> = {
  'in stock':                    'in_stock',
  'in stock.':                   'in_stock',
  'ships from':                  'in_stock',   // "Ships from Amazon"
  'usually ships':               'in_stock',   // "Usually ships in X days"
  'available to ship':           'in_stock',
  'temporarily out of stock':    'out_of_stock',
  'currently unavailable':       'out_of_stock',
  'out of stock':                'out_of_stock',
  'unavailable':                 'out_of_stock',
  'only':                        'limited',    // "Only 3 left in stock"
  'order soon':                  'limited',    // "Order soon"
  'pre-order':                   'preorder',
  'preorder':                    'preorder',
  'pre-release date':            'preorder',
  'available on':                'preorder',   // "Available on [date]"
  'discontinued by manufacturer':'discontinued',
  'discontinued':                'discontinued',
}

// ── ASIN validation ───────────────────────────────────────────────────────────

/** ASIN: Amazon Standard Identification Number — 10 alphanumeric chars */
const ASIN_REGEX = /^[A-Z0-9]{10}$/

// ── Provider implementation ───────────────────────────────────────────────────

export const amazonProvider: RetailerProvider = {
  retailer: AMAZON_RETAILER,

  buildProductUrl(externalId: string): string {
    return `https://www.amazon.com/dp/${externalId}`
  },

  buildAffiliateUrl(productUrl: string): string {
    try {
      const url = new URL(productUrl)
      url.searchParams.set('tag', AMAZON_RETAILER.affiliateTag!)
      return url.toString()
    } catch {
      // Fallback: string append if URL parsing fails
      const separator = productUrl.includes('?') ? '&' : '?'
      return `${productUrl}${separator}tag=${AMAZON_RETAILER.affiliateTag}`
    }
  },

  buildSearchUrl(query: string): string {
    const encoded = encodeURIComponent(query)
    return `https://www.amazon.com/s?k=${encoded}&tag=${AMAZON_RETAILER.affiliateTag}`
  },

  normalizeAvailability(rawStatus: string): AvailabilityStatus {
    const lower = rawStatus.toLowerCase().trim()

    // Check each known string — order matters (more specific first)
    for (const [key, status] of Object.entries(AMAZON_AVAILABILITY_MAP)) {
      if (lower.includes(key)) return status
    }

    return 'unknown'
  },

  normalizePrice(rawPrice: string | number): number {
    if (typeof rawPrice === 'number') {
      return isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : NaN
    }

    // Remove currency symbols and whitespace
    const cleaned = rawPrice
      .replace(/[$,\s]/g, '')
      .trim()

    const parsed = parseFloat(cleaned)
    return isFinite(parsed) && parsed >= 0 ? parsed : NaN
  },

  normalizeProduct(raw: RawRetailerData): NormalizedRetailerProduct | null {
    // Phase N+2: parse raw.rawHtml / raw.rawJson into structured product
    // For now: return null (no raw data to parse until fetchers are built)
    if (!raw.success || raw.error) return null

    // Future implementation will extract:
    //   - title from <span id="productTitle">
    //   - price from <span class="a-price-whole"> + <span class="a-price-fraction">
    //   - availability from <div id="availability">
    //   - images from imageData JSON in page scripts

    return null
  },

  validateExternalId(externalId: string): boolean {
    return ASIN_REGEX.test(externalId)
  },

  validateProduct(product: NormalizedRetailerProduct): ValidationResult {
    const errors: string[]   = []
    const warnings: string[] = []

    if (!product.externalId || !ASIN_REGEX.test(product.externalId)) {
      errors.push(`Invalid ASIN format: "${product.externalId}"`)
    }

    if (isNaN(product.price) || product.price <= 0) {
      errors.push(`Invalid price: ${product.price}`)
    }

    if (product.price > 10_000) {
      warnings.push(`Unusually high price: $${product.price} — verify manually`)
    }

    if (!product.title || product.title.trim().length < 5) {
      errors.push('Product title too short or missing')
    }

    if (!product.url.startsWith('https://www.amazon.com')) {
      errors.push(`URL does not match Amazon domain: ${product.url}`)
    }

    if (!product.imageUrl) {
      warnings.push('Missing product image URL')
    }

    if (product.availability === 'unknown') {
      warnings.push('Could not determine availability status')
    }

    return { isValid: errors.length === 0, errors, warnings }
  },
}
