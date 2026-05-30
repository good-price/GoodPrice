/**
 * lib/catalog/repair/candidate-search.ts
 *
 * Multi-source candidate search for the repair pipeline.
 *
 * Sources (in priority order):
 *   1. CDN swap      — swap images-na.ssl-images-amazon.com/images/I/ → m.media-amazon.com/images/I/
 *                      Deterministic, no network lookup needed before HEAD verification.
 *                      Does NOT work for images/P/ format (needs PA-API hash).
 *
 *   2. MercadoLibre  — free search API, no credentials required.
 *                      Returns Colombia-native products as reference candidates.
 *                      Useful for scoring what's popular in a category when the
 *                      original Amazon product is gone.
 *                      NOTE: ML products have ML IDs, not Amazon ASINs.
 *                      These candidates cannot auto-replace an Amazon product; they
 *                      are presented as "manual review" references.
 *
 * What is NOT done here:
 *   - Amazon HTML scraping (blocked, unreliable, against ToS)
 *   - PA-API product lookup (requires credentials — see scripts/paapi-sync.ts)
 *
 * When PA-API credentials are available, the PA-API sync pipeline will
 * handle image URL refresh and is the preferred mechanism for ASIN replacement.
 */

import type { RepairCandidate } from './types'
import type { Product } from '@/types'

// ── Constants ──────────────────────────────────────────────────────────────────

const OLD_CDN_I  = 'https://images-na.ssl-images-amazon.com/images/I/'
const OLD_CDN_P  = 'https://images-na.ssl-images-amazon.com/images/P/'
const NEW_CDN_I  = 'https://m.media-amazon.com/images/I/'

/** MercadoLibre Colombia site ID */
const ML_SITE = 'MCO'

/** Approximate COP → USD rate (updated manually or via env var) */
const COP_TO_USD = parseFloat(process.env.COP_TO_USD_RATE ?? '0.00025') // ~4000 COP/USD

/** HTTP timeout for image verification HEAD requests */
const VERIFY_TIMEOUT_MS = 6000

// ── CDN image repair ────────────────────────────────────────────────────────────

/**
 * Attempts to construct a repaired image URL from a broken images-na CDN URL.
 *
 * For /images/I/ paths: deterministic swap → high confidence.
 * For /images/P/ paths: these use ASIN-based naming that the new CDN doesn't serve;
 *   returns null (requires PA-API to fetch the real image hash).
 */
export function buildRepairedImageUrl(brokenUrl: string): string | null {
  if (brokenUrl.startsWith(OLD_CDN_I)) {
    const filename = brokenUrl.slice(OLD_CDN_I.length)
    return `${NEW_CDN_I}${filename}`
  }
  if (brokenUrl.startsWith(OLD_CDN_P)) {
    // P/ format encodes the ASIN but m.media-amazon.com uses image hashes (I/ format)
    // We cannot derive the hash without a PA-API GetItems call.
    return null
  }
  return null
}

/**
 * Verifies that an image URL returns a successful HTTP response.
 * Uses a HEAD request — no body downloaded.
 * Returns true on 200–299, false on any error or 4xx/5xx.
 */
export async function verifyImageUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GOODPRICE/1.0; catalog-repair)',
      },
      redirect: 'follow',
    })
    return res.status >= 200 && res.status < 300
  } catch {
    return false
  }
}

/**
 * Returns a CDN-swap candidate for a product with a broken image URL.
 * Returns null if the image is /images/P/ format (needs PA-API).
 *
 * NOTE: Does NOT verify the new URL — call verifyImageUrl() separately
 * to keep search functions synchronous and testable.
 */
export function buildCdnSwapCandidate(product: Product): RepairCandidate | null {
  const repairedUrl = buildRepairedImageUrl(product.image ?? '')
  if (!repairedUrl) return null

  return {
    source: 'cdn_swap',
    imageUrl: repairedUrl,
    title: product.title,
    price: product.price,
    confidence: 0,  // set after verifyImageUrl() confirms the URL works
    scoreBreakdown: {
      imageScore: 0,    // filled after verification
      titleScore: 25,   // same product — perfect title match
      priceScore: 20,   // same product — same price
      reviewScore: 15,  // same product — same reviews
      categoryScore: 15, // same category
    },
    notes: `CDN swap: images-na → m.media-amazon.com`,
  }
}

// ── MercadoLibre search ────────────────────────────────────────────────────────

interface MlProduct {
  id: string
  title: string
  price: number
  currency_id: string
  thumbnail: string
  condition: string
  available_quantity: number
  permalink?: string
  shipping?: { free_shipping?: boolean }
  attributes?: Array<{ id: string; value_name?: string }>
}

interface MlSearchResponse {
  results: MlProduct[]
}

/**
 * Builds a search query for a product.
 * Uses brand + key words from title, limited to ~50 chars to avoid ML query length issues.
 */
export function buildSearchQuery(product: Product): string {
  const parts: string[] = []

  if (product.brand) parts.push(product.brand)

  // Extract meaningful keywords from title (skip stop words, keep brands + nouns)
  const stopWords = new Set([
    'con', 'de', 'en', 'la', 'el', 'los', 'las', 'un', 'una', 'para', 'por',
    'del', 'al', 'y', 'o', 'a', 'se', 'es', 'que', 'its', 'the', 'and', 'for',
    'with', 'inch', 'pulgadas', 'generación', 'generacion', 'edition', 'edición',
  ])

  const titleWords = product.title
    .replace(/[()[\]–—]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
    .slice(0, 4)   // take first 4 meaningful words

  for (const w of titleWords) {
    if (!parts.some(p => p.toLowerCase().includes(w.toLowerCase()))) {
      parts.push(w)
    }
  }

  return parts.join(' ').slice(0, 100)
}

/**
 * Searches MercadoLibre Colombia for products matching the query.
 * Uses the free public API — no authentication required.
 *
 * Returns up to `limit` raw ML product objects (not scored yet).
 */
export async function searchMercadoLibre(
  query: string,
  limit = 5,
): Promise<MlProduct[]> {
  const url =
    `https://api.mercadolibre.com/sites/${ML_SITE}/search` +
    `?q=${encodeURIComponent(query)}&limit=${limit}&condition=new`

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return []
    const data = (await res.json()) as MlSearchResponse
    return data.results ?? []
  } catch {
    return []
  }
}

/**
 * Converts a MercadoLibre search result into a RepairCandidate.
 * Scoring is deferred to candidate-scoring.ts — sets only structural fields here.
 */
export function mlProductToCandidate(ml: MlProduct): RepairCandidate {
  const priceUsd = ml.currency_id === 'COP' ? ml.price * COP_TO_USD : ml.price

  // Fix ML thumbnail quality: replace -O (160px) suffix with -W (500px)
  const imageUrl = (ml.thumbnail ?? '').replace(/-O\.jpg$/, '-W.jpg').replace(/-O\.webp$/, '-W.webp')

  const brandAttr = (ml.attributes ?? []).find(a => a.id === 'BRAND')
  const brand = brandAttr?.value_name

  return {
    source: 'mercadolibre',
    imageUrl: imageUrl || undefined,
    title: ml.title,
    price: priceUsd,
    mlItemId: ml.id,
    mlPermalink: ml.permalink,
    confidence: 0, // filled by candidate-scoring.ts
    scoreBreakdown: {
      imageScore: 0,
      titleScore: 0,
      priceScore: 0,
      reviewScore: 0,
      categoryScore: 0,
    },
    notes: brand ? `Brand: ${brand}` : undefined,
  }
}

/**
 * Full candidate search for a product.
 * Returns all candidates from all sources, unsorted.
 * Scoring is done by candidate-scoring.ts.
 */
export async function searchCandidates(
  product: Product,
  options: { searchMl?: boolean } = { searchMl: true },
): Promise<RepairCandidate[]> {
  const candidates: RepairCandidate[] = []

  // ── Source 1: CDN swap (instant, no network needed at search time) ──────────
  const cdnCandidate = buildCdnSwapCandidate(product)
  if (cdnCandidate) {
    candidates.push(cdnCandidate)
  }

  // ── Source 2: MercadoLibre (free API, Colombia-native) ────────────────────
  if (options.searchMl) {
    const query = buildSearchQuery(product)
    if (query.trim().length > 3) {
      const mlResults = await searchMercadoLibre(query, 5)
      for (const ml of mlResults) {
        candidates.push(mlProductToCandidate(ml))
      }
    }
  }

  return candidates
}
