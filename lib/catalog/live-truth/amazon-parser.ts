/**
 * lib/catalog/live-truth/amazon-parser.ts
 *
 * Fetches Amazon product pages and extracts live product data without browser
 * automation. Uses JSON-LD structured data as the primary source, with HTML
 * regex patterns as fallbacks.
 *
 * Anti-bot resilience rules:
 *   - All failures return confidence:'failed', never triggering quarantine alone
 *   - Robot-check / CAPTCHA pages are detected and returned as failed
 *   - HTTP non-200 (503, 429 etc.) = infrastructure noise, not a product issue
 *   - Only HTTP 404 has product-level meaning (ASIN no longer exists)
 *   - Extraction confidence degrades gracefully: high → medium → low → failed
 */

import type { ExtractedProductData, AvailabilityStatus } from './types'

// ── Request config ─────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 12_000
const MIN_PRODUCT_HTML = 2_000   // Shorter pages are bot-check / error pages

const HEADERS: Record<string, string> = {
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  // Force Amazon to serve prices in USD regardless of the server's geographic IP.
  // Without this, Amazon detects non-US IPs and serves local currency (e.g. COP from Colombia).
  'Cookie':          'i18n-prefs=USD',
  'Connection':      'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control':   'no-cache',
  'Sec-Fetch-Dest':  'document',
  'Sec-Fetch-Mode':  'navigate',
  'Sec-Fetch-Site':  'none',
  'Sec-Fetch-User':  '?1',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
}

// ── Robot-check detection ─────────────────────────────────────────────────────

const ROBOT_SIGNALS = [
  'Robot Check',
  'Enter the characters you see below',
  'Sorry, we just need to make sure you',
  'api-services-support@amazon.com',
  'Type the characters you see in this image',
  'CAPTCHA',
  'validateCaptcha',
]

function isRobotCheckPage(html: string): boolean {
  if (html.length < MIN_PRODUCT_HTML) return true
  return ROBOT_SIGNALS.some(s => html.includes(s))
}

// ── JSON-LD extraction ────────────────────────────────────────────────────────

type JsonLdObject = Record<string, unknown>

function extractJsonLd(html: string): JsonLdObject | null {
  const pattern = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = pattern.exec(html)) !== null) {
    try {
      const raw = m[1].trim()
      if (!raw) continue
      const parsed: unknown = JSON.parse(raw)
      const candidates: unknown[] = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of candidates) {
        if (
          item !== null &&
          typeof item === 'object' &&
          (item as JsonLdObject)['@type'] === 'Product'
        ) {
          return item as JsonLdObject
        }
      }
    } catch { /* skip malformed JSON */ }
  }
  return null
}

// ── Meta tag extraction ───────────────────────────────────────────────────────

function extractMeta(html: string, property: string): string | null {
  // Try property= and name= in both attribute orderings
  const tries = [
    new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, 'i'),
    new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${property}"`, 'i'),
    new RegExp(`<meta[^>]+name="${property}"[^>]+content="([^"]*)"`, 'i'),
    new RegExp(`<meta[^>]+content="([^"]*)"[^>]+name="${property}"`, 'i'),
  ]
  for (const re of tries) {
    const match = html.match(re)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

// ── Title extraction ──────────────────────────────────────────────────────────

function extractTitle(html: string, ld: JsonLdObject | null): string | null {
  // 1. JSON-LD name
  if (typeof ld?.name === 'string' && ld.name.trim()) return ld.name.trim()

  // 2. Open Graph title (strip " : Amazon.com" suffix)
  const og = extractMeta(html, 'og:title')
  if (og) return og.replace(/\s*[:|]\s*Amazon\.com\s*$/i, '').trim()

  // 3. #productTitle span
  const m1 = html.match(/id="productTitle"[^>]*>\s*([\s\S]*?)\s*<\/span>/)
  if (m1?.[1]) return m1[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

  // 4. HTML <title> tag
  const m2 = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (m2?.[1]) return m2[1].replace(/\s*[:|]\s*Amazon\.com.*$/i, '').trim()

  return null
}

// ── Price helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the currency symbol found in the first non-empty a-price-symbol span.
 * '$' → USD, 'COP' → Colombian Peso, null → no price block present.
 * Used to gate price extraction: we only accept '$' (or absent, for lenient fallback).
 */
function extractPriceSymbol(html: string): string | null {
  const pattern = /<span[^>]+class="[^"]*a-price-symbol[^"]*"[^>]*>([^<]*)<\/span>/g
  let m: RegExpExecArray | null
  while ((m = pattern.exec(html)) !== null) {
    const sym = m[1].trim()
    if (sym) return sym
  }
  return null
}

function coercePrice(raw: unknown): number | null {
  if (typeof raw === 'number' && raw > 0 && raw < 100_000) return raw
  if (typeof raw === 'string') {
    const n = parseFloat(raw.replace(/[$,\s]/g, ''))
    if (!isNaN(n) && n > 0 && n < 100_000) return n
  }
  return null
}

function extractPrice(html: string, ld: JsonLdObject | null): number | null {
  // 1. JSON-LD offers.price / offers.lowPrice
  if (ld?.offers && typeof ld.offers === 'object') {
    const o = ld.offers as JsonLdObject
    const p = coercePrice(o.price) ?? coercePrice(o.lowPrice)
    if (p) return p
  }

  // 2. OG price
  const ogPrice = extractMeta(html, 'product:price:amount') ??
                  extractMeta(html, 'og:price:amount')
  if (ogPrice) { const p = coercePrice(ogPrice); if (p) return p }

  // 3. Screen-reader offscreen span (most stable Amazon pattern)
  //    <span class="a-offscreen">$XX.XX</span>
  const m1 = html.match(/<span\s+class="a-offscreen"\s*>\s*\$?([\d,]+\.?\d*)\s*<\/span>/i)
  if (m1?.[1]) { const p = coercePrice(m1[1]); if (p) return p }

  // 4. Whole + fraction split pattern
  const whole = html.match(/<span[^>]+class="[^"]*a-price-whole[^"]*"[^>]*>([\d,]+)/)
  const frac  = html.match(/<span[^>]+class="[^"]*a-price-fraction[^"]*"[^>]*>(\d{2})/)
  if (whole?.[1]) {
    const w = parseInt(whole[1].replace(',', ''), 10)
    const f = frac?.[1] ? parseInt(frac[1], 10) : 0
    const price = w + f / 100
    if (price > 0 && price < 100_000) return price
  }

  return null
}

function extractOldPrice(html: string, ld: JsonLdObject | null): number | null {
  // 1. JSON-LD offers.highPrice
  if (ld?.offers && typeof ld.offers === 'object') {
    const p = coercePrice((ld.offers as JsonLdObject).highPrice)
    if (p) return p
  }

  // 2. Strikethrough "was" price — looks for a-text-price block
  //    <span class="a-price a-text-price" ...><span class="a-offscreen">$XX.XX</span>
  const strikeBlock = html.match(
    /a-text-price[^"]*"[^>]*>[\s\S]{0,200}?<span\s+class="a-offscreen"\s*>\s*\$?([\d,]+\.?\d*)\s*<\/span>/i,
  )
  if (strikeBlock?.[1]) { const p = coercePrice(strikeBlock[1]); if (p) return p }

  return null
}

// ── Availability extraction ───────────────────────────────────────────────────

const UNAVAIL_PHRASES = [
  'Currently unavailable',
  'This item is not available',
  'Unavailable',
  'We don\'t know when or if this item will be back in stock',
  'Currently out of stock',
  'This item has been discontinued',
  'Item under review',
  'No disponible por el momento',
]

function classifyAvailability(text: string): AvailabilityStatus {
  const t = text.toLowerCase()
  if (UNAVAIL_PHRASES.some(p => text.includes(p)))    return 'unavailable'
  if (t.includes('out of stock'))                      return 'out_of_stock'
  if (t.includes('in stock') || t.includes('ships'))  return 'in_stock'
  if (t.includes('add to cart'))                       return 'in_stock'
  if (t.includes('only') && t.includes('left'))        return 'limited'
  return 'unknown'
}

interface AvailResult { text: string; status: AvailabilityStatus }

function extractAvailability(html: string, ld: JsonLdObject | null): AvailResult {
  // 1. JSON-LD availability URL
  if (ld?.offers && typeof ld.offers === 'object') {
    const av = (ld.offers as JsonLdObject).availability
    if (typeof av === 'string') {
      if (av.includes('InStock'))        return { text: av, status: 'in_stock' }
      if (av.includes('OutOfStock'))     return { text: av, status: 'out_of_stock' }
      if (av.includes('Discontinued') ||
          av.includes('Unavailable'))    return { text: av, status: 'unavailable' }
      if (av.includes('LimitedAvailability')) return { text: av, status: 'limited' }
    }
  }

  // 2. #availability span
  const avEl = html.match(/id="availability"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)
  if (avEl?.[1]) {
    const text = avEl[1].replace(/<[^>]+>/g, '').trim()
    if (text) return { text, status: classifyAvailability(text) }
  }

  // 3. Scan page for known unavailability phrases
  for (const phrase of UNAVAIL_PHRASES) {
    if (html.includes(phrase)) return { text: phrase, status: 'unavailable' }
  }

  // 4. "Add to Cart" button = available
  if (html.includes('id="add-to-cart-button"') ||
      (html.includes('addToCart') && html.includes('In Stock'))) {
    return { text: 'Add to Cart', status: 'in_stock' }
  }

  return { text: '', status: 'unknown' }
}

// ── Image extraction ──────────────────────────────────────────────────────────

function extractImage(html: string, ld: JsonLdObject | null): string | null {
  // 1. JSON-LD image field
  if (ld?.image) {
    const img = ld.image
    if (typeof img === 'string') return img
    if (Array.isArray(img) && typeof img[0] === 'string') return img[0]
    if (typeof img === 'object' && img !== null) {
      const u = (img as JsonLdObject).url
      if (typeof u === 'string') return u
    }
  }

  // 2. Open Graph image
  const og = extractMeta(html, 'og:image')
  if (og && og.includes('amazon')) return og

  // 3. #landingImage src
  const li = html.match(/id="landingImage"[^>]+src="([^"]+)"/)
  if (li?.[1]) return li[1]

  // 4. data-old-hires (high-res product image)
  const hi = html.match(/data-old-hires="([^"]+\.(?:jpg|png|webp)[^"]*)"/)
  if (hi?.[1]) return hi[1]

  return null
}

// ── Brand extraction ──────────────────────────────────────────────────────────

function extractBrand(html: string, ld: JsonLdObject | null): string | null {
  if (ld?.brand) {
    const b = ld.brand
    if (typeof b === 'string') return b
    if (typeof b === 'object' && b !== null && typeof (b as JsonLdObject).name === 'string') {
      return (b as JsonLdObject).name as string
    }
  }
  // "by BRAND" link pattern
  const m = html.match(/by\s+<a[^>]+>([^<]+)<\/a>/i)
  if (m?.[1]) return m[1].trim()
  return null
}

// ── Rating & review-count extraction ─────────────────────────────────────────

function extractRating(html: string, ld: JsonLdObject | null): number | null {
  // 1. JSON-LD aggregateRating.ratingValue
  if (ld?.aggregateRating && typeof ld.aggregateRating === 'object') {
    const ar = ld.aggregateRating as JsonLdObject
    const v = parseFloat(String(ar.ratingValue))
    if (!isNaN(v) && v > 0 && v <= 5) return Math.round(v * 10) / 10
  }
  // 2. <span class="a-icon-alt">4.7 out of 5 stars</span>
  const m1 = html.match(/<span[^>]+class="[^"]*a-icon-alt[^"]*"[^>]*>([\d.]+)\s+out of 5/i)
  if (m1?.[1]) {
    const v = parseFloat(m1[1])
    if (!isNaN(v) && v > 0 && v <= 5) return Math.round(v * 10) / 10
  }
  // 3. id="acrPopover" title="4.7 out of 5 stars"
  const m2 = html.match(/id="acrPopover"[^>]*title="([\d.]+)\s+out of 5/i)
  if (m2?.[1]) {
    const v = parseFloat(m2[1])
    if (!isNaN(v) && v > 0 && v <= 5) return Math.round(v * 10) / 10
  }
  return null
}

function extractReviewCount(html: string, ld: JsonLdObject | null): number | null {
  // 1. JSON-LD aggregateRating.reviewCount
  if (ld?.aggregateRating && typeof ld.aggregateRating === 'object') {
    const ar = ld.aggregateRating as JsonLdObject
    const v = parseInt(String(ar.reviewCount ?? ar.ratingCount), 10)
    if (!isNaN(v) && v >= 0) return v
  }
  // 2. <span id="acrCustomerReviewText">12,345 ratings</span>
  const m = html.match(/id="acrCustomerReviewText"[^>]*>([\d,]+)\s+(?:global\s+)?rating/i)
  if (m?.[1]) {
    const v = parseInt(m[1].replace(/,/g, ''), 10)
    if (!isNaN(v) && v >= 0) return v
  }
  return null
}

function detectShippingRestriction(html: string): boolean {
  return (
    html.includes('cannot be shipped to your selected delivery location') ||
    html.includes("item can't be shipped") ||
    html.includes('not available for international shipping') ||
    html.includes('does not ship internationally')
  )
}

// ── Confidence assessment ─────────────────────────────────────────────────────

function assessConfidence(
  ld: JsonLdObject | null,
  extracted: { title?: string | null; price?: number | null; avStatus: AvailabilityStatus },
): ExtractedProductData['confidence'] {
  const signals = [
    !!extracted.title,
    !!extracted.price,
    extracted.avStatus !== 'unknown',
  ].filter(Boolean).length

  if (ld !== null && signals >= 2)  return 'high'
  if (signals >= 2)                 return 'medium'
  if (signals >= 1)                 return 'low'
  return 'failed'
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fetches the Amazon product page for the given ASIN and extracts live data.
 * Never throws — all failures are encoded in the returned object.
 *
 * Callers must not quarantine a product based solely on confidence:'failed'
 * because this may reflect transient network conditions, not product state.
 */
export async function fetchAndParseProduct(asin: string): Promise<ExtractedProductData> {
  const url = `https://www.amazon.com/dp/${asin}`

  let html: string
  let httpStatus: number
  let finalUrl: string | undefined

  try {
    const res = await fetch(url, {
      headers: HEADERS,
      redirect: 'follow',
      signal:   AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    httpStatus = res.status
    finalUrl   = res.url
    html = await res.text()
  } catch {
    // Network error or timeout
    return {
      availabilityStatus: 'unknown',
      confidence:         'failed',
      isRobotCheck:       false,
      rawHtmlLength:      0,
    }
  }

  // 404 = ASIN definitively gone (reliable signal, act on it)
  if (httpStatus === 404) {
    return {
      availabilityStatus: 'unavailable',
      confidence:         'high',
      httpStatus:         404,
      isRobotCheck:       false,
      rawHtmlLength:      html.length,
    }
  }

  // Non-200 (503, 429, etc.) = infrastructure noise — don't penalise product
  if (httpStatus !== 200) {
    return {
      availabilityStatus: 'unknown',
      confidence:         'failed',
      httpStatus,
      isRobotCheck:       false,
      rawHtmlLength:      html.length,
    }
  }

  // Robot check / CAPTCHA page
  if (isRobotCheckPage(html)) {
    return {
      availabilityStatus: 'unknown',
      confidence:         'failed',
      httpStatus,
      isRobotCheck:       true,
      rawHtmlLength:      html.length,
    }
  }

  // ── Parse ──────────────────────────────────────────────────────────────────
  const ld          = extractJsonLd(html)
  const priceSymbol = extractPriceSymbol(html)

  // Accept prices only when the currency symbol is '$' (USD) or absent (unknown/no block).
  // Any other symbol (e.g. 'COP', 'EUR') means Amazon served a geo-localised price — reject it.
  const isUsd      = !priceSymbol || priceSymbol === '$'
  const title      = extractTitle(html, ld)
  const priceUSD   = isUsd ? extractPrice(html, ld)    : null
  const oldPrice   = isUsd ? extractOldPrice(html, ld) : null
  const av         = extractAvailability(html, ld)
  const imageUrl   = extractImage(html, ld)
  const brand      = extractBrand(html, ld)
  const confidence = assessConfidence(ld, { title, price: priceUSD, avStatus: av.status })
  const rating     = extractRating(html, ld)
  const reviewCount = extractReviewCount(html, ld)
  const shippingRestriction = detectShippingRestriction(html)

  return {
    title:               title        ?? undefined,
    priceUSD:            priceUSD     ?? undefined,
    oldPriceUSD:         oldPrice     ?? undefined,
    availability:        av.text      || undefined,
    availabilityStatus:  av.status,
    imageUrl:            imageUrl     ?? undefined,
    brand:               brand        ?? undefined,
    confidence,
    httpStatus,
    isRobotCheck:        false,
    rawHtmlLength:       html.length,
    finalUrl,
    detectedCurrency:    priceSymbol  ?? undefined,
    rating:              rating       ?? undefined,
    reviewCount:         reviewCount  ?? undefined,
    shippingRestriction: shippingRestriction || undefined,
  }
}
