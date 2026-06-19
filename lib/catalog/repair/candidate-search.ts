/**
 * lib/catalog/repair/candidate-search.ts
 *
 * Multi-source candidate search for the repair pipeline.
 *
 * Sources (in priority order):
 *   1. CDN swap    — swap images-na.ssl-images-amazon.com/images/I/ → m.media-amazon.com/images/I/
 *                    Deterministic, no network lookup needed before HEAD verification.
 *                    Does NOT work for images/P/ format (needs PA-API hash).
 *
 *   2. Amazon page — scrape the Amazon product page for an updated image URL.
 *                    [NOT IMPLEMENTED — placeholder returns empty array]
 *
 *   3. PA-API      — Amazon Product Advertising API GetItems call.
 *                    Authoritative image hash source for /images/P/ paths.
 *                    [NOT IMPLEMENTED — requires credentials, see scripts/paapi-sync.ts]
 *
 *   4. Manual      — admin-provided image URL or ASIN override.
 *                    [NOT IMPLEMENTED — placeholder returns empty array]
 */

import type { RepairCandidate } from './types'
import type { Product } from '@/types'

// ── Constants ──────────────────────────────────────────────────────────────────

const OLD_CDN_I  = 'https://images-na.ssl-images-amazon.com/images/I/'
const OLD_CDN_P  = 'https://images-na.ssl-images-amazon.com/images/P/'
const NEW_CDN_I  = 'https://m.media-amazon.com/images/I/'

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

// ── Future-source stubs ────────────────────────────────────────────────────────

/**
 * Searches the Amazon product page for an updated image URL.
 * NOT IMPLEMENTED — returns empty array until Amazon scraping is viable.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function searchAmazonPage(product: Product): Promise<RepairCandidate[]> {
  return []
}

/**
 * Fetches authoritative product data via Amazon PA-API GetItems.
 * NOT IMPLEMENTED — returns empty array until credentials are configured.
 * See scripts/paapi-sync.ts for the credential-based implementation path.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function searchPaapi(product: Product): Promise<RepairCandidate[]> {
  return []
}

/**
 * Returns admin-provided image URL or ASIN overrides for a product.
 * NOT IMPLEMENTED — returns empty array until manual override store is built.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function searchManualOverrides(product: Product): Promise<RepairCandidate[]> {
  return []
}

// ── Search query builder (shared utility) ─────────────────────────────────────

/**
 * Builds a keyword search query from a product's brand and title.
 * Used by future search sources (amazon_page, paapi, manual lookup UI).
 */
export function buildSearchQuery(product: Product): string {
  const parts: string[] = []

  if (product.brand) parts.push(product.brand)

  const stopWords = new Set([
    'con', 'de', 'en', 'la', 'el', 'los', 'las', 'un', 'una', 'para', 'por',
    'del', 'al', 'y', 'o', 'a', 'se', 'es', 'que', 'its', 'the', 'and', 'for',
    'with', 'inch', 'pulgadas', 'generación', 'generacion', 'edition', 'edición',
  ])

  const titleWords = product.title
    .replace(/[()[\]–—]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
    .slice(0, 4)

  for (const w of titleWords) {
    if (!parts.some(p => p.toLowerCase().includes(w.toLowerCase()))) {
      parts.push(w)
    }
  }

  return parts.join(' ').slice(0, 100)
}

// ── Orchestrator ───────────────────────────────────────────────────────────────

/**
 * Full candidate search for a product.
 * Returns all candidates from all sources, unsorted.
 * Scoring is done by candidate-scoring.ts.
 */
export async function searchCandidates(
  product: Product,
): Promise<RepairCandidate[]> {
  const candidates: RepairCandidate[] = []

  // ── Source 1: CDN swap (instant, no network needed at search time) ──────────
  const cdnCandidate = buildCdnSwapCandidate(product)
  if (cdnCandidate) candidates.push(cdnCandidate)

  // ── Source 2: Amazon page (not yet implemented) ──────────────────────────────
  candidates.push(...await searchAmazonPage(product))

  // ── Source 3: PA-API (not yet implemented) ───────────────────────────────────
  candidates.push(...await searchPaapi(product))

  // ── Source 4: Manual overrides (not yet implemented) ─────────────────────────
  candidates.push(...await searchManualOverrides(product))

  return candidates
}
