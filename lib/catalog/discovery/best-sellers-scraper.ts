/**
 * lib/catalog/discovery/best-sellers-scraper.ts
 *
 * Fetches Amazon Best Sellers category pages and extracts product tiles.
 * No browser automation — pure HTML parsing via regex, matching the approach
 * used by amazon-parser.ts for product pages.
 *
 * Tile extraction is based on the data-asin anchor found in every product tile.
 * A fixed forward window of 4 KB is captured per tile to extract metadata.
 */

import type { BestSellerTile, CategoryScrapeResult } from './types'

// ── Request config ─────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 20_000
const TILE_WINDOW      = 4_000   // chars captured forward per tile
const MIN_PAGE_SIZE    = 5_000   // shorter pages = bot-check / redirect

// Headers are identical to amazon-parser.ts — required to avoid bot detection.
const HEADERS: Record<string, string> = {
  'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language':           'en-US,en;q=0.9',
  'Cookie':                    'i18n-prefs=USD',
  'Connection':                'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control':             'no-cache',
  'Sec-Fetch-Dest':            'document',
  'Sec-Fetch-Mode':            'navigate',
  'Sec-Fetch-Site':            'none',
  'Sec-Fetch-User':            '?1',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
}

const ROBOT_SIGNALS = [
  'Robot Check',
  'Enter the characters you see below',
  'Sorry, we just need to make sure you',
  'api-services-support@amazon.com',
  'validateCaptcha',
  'CAPTCHA',
]

// ── Category URL map ───────────────────────────────────────────────────────────

export const BEST_SELLERS_CATEGORIES: ReadonlyArray<{ category: string; url: string }> = [
  { category: 'electronica',  url: 'https://www.amazon.com/bestsellers/electronics' },
  { category: 'gaming',       url: 'https://www.amazon.com/bestsellers/videogames' },
  { category: 'hogar',        url: 'https://www.amazon.com/bestsellers/kitchen' },
  { category: 'deporte',      url: 'https://www.amazon.com/bestsellers/sporting-goods' },
  { category: 'oficina',      url: 'https://www.amazon.com/bestsellers/office-products' },
  { category: 'mascotas',     url: 'https://www.amazon.com/bestsellers/pet-supplies' },
  // "tools" slug returns a non-standard page with no data-asin tiles;
  // the correct slug for Tools & Home Improvement is "hi".
  { category: 'herramientas', url: 'https://www.amazon.com/bestsellers/hi' },
  { category: 'belleza',      url: 'https://www.amazon.com/bestsellers/beauty' },
  { category: 'bebes',        url: 'https://www.amazon.com/bestsellers/baby-products' },
]

// ── Tile extraction ────────────────────────────────────────────────────────────

function extractTiles(html: string, category: string): BestSellerTile[] {
  const tiles: BestSellerTile[] = []
  const seen   = new Set<string>()
  const asinRe = /data-asin="([A-Z0-9]{10})"/g
  let m: RegExpExecArray | null
  let rank = 0

  while ((m = asinRe.exec(html)) !== null) {
    const asin = m[1]
    if (asin === '0000000000' || seen.has(asin)) continue
    seen.add(asin)
    rank++

    const chunk = html.substring(m.index, m.index + TILE_WINDOW)

    // ── Rating ──────────────────────────────────────────────────────────────
    let rating: number | null = null
    const rm = chunk.match(/(\d\.\d)\s+out\s+of\s+5\s+stars/i)
    if (rm) rating = parseFloat(rm[1])

    // ── Review count ────────────────────────────────────────────────────────
    let reviewCount: number | null = null
    const rv1 = chunk.match(/([\d,]+)\s+ratings?/i)
    if (rv1) reviewCount = parseInt(rv1[1].replace(/,/g, ''), 10)
    if (!reviewCount) {
      // Some tiles use "(23,456)" format
      const rv2 = chunk.match(/\(([\d,]+)\)/)
      if (rv2) reviewCount = parseInt(rv2[1].replace(/,/g, ''), 10)
    }

    // ── Price ────────────────────────────────────────────────────────────────
    let tilePrice: number | null = null
    const pm = chunk.match(/\$(\d{1,4}(?:\.\d{1,2})?)/)
    if (pm) tilePrice = parseFloat(pm[1])

    // ── Title ────────────────────────────────────────────────────────────────
    // Try img alt text first (most reliable in BS tiles — product image alt = title).
    let tileTitle: string | null = null
    const altRe = /alt="([^"]{20,300})"/g
    let am: RegExpExecArray | null
    while ((am = altRe.exec(chunk)) !== null) {
      const t = am[1].trim()
      if (!t.startsWith('http') && !t.match(/^\d/) && t.length >= 20) {
        tileTitle = t
        break
      }
    }
    // Fallback: longest span text (≥20 chars, looks like a title)
    if (!tileTitle) {
      const spanRe = /<span[^>]*>([^<]{20,300})<\/span>/g
      let best: string | null = null
      let sm: RegExpExecArray | null
      while ((sm = spanRe.exec(chunk)) !== null) {
        if (best === null || sm[1].length > best.length) best = sm[1]
      }
      if (best) tileTitle = best.trim()
    }

    // ── Image URL ────────────────────────────────────────────────────────────
    // Best Sellers tiles use images-na.ssl-images-amazon.com (not m.media-amazon.com).
    let imageUrl: string | null = null
    const imgRe = chunk.match(
      /src="(https:\/\/(?:m\.media-amazon\.com|images-na\.ssl-images-amazon\.com)\/images\/[^"]+\.(?:jpg|png|webp)[^"]*)"/,
    )
    if (imgRe?.[1]) imageUrl = imgRe[1]

    tiles.push({ asin, rank, category, tileTitle, imageUrl, rating, reviewCount, tilePrice })
  }

  return tiles
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchBestSellersPage(
  category: string,
  url: string,
): Promise<CategoryScrapeResult & { tiles: BestSellerTile[] }> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)

  let html: string
  try {
    const resp = await fetch(url, {
      headers:  HEADERS,
      redirect: 'follow',
      signal:   ctrl.signal,
    })
    clearTimeout(timer)

    if (!resp.ok) {
      return { category, url, tiles: [], extracted: 0, filtered: 0, passed: 0, blocked: false, error: `HTTP ${resp.status}` }
    }
    html = await resp.text()
  } catch (e: unknown) {
    clearTimeout(timer)
    const msg = e instanceof Error ? e.message : String(e)
    return { category, url, tiles: [], extracted: 0, filtered: 0, passed: 0, blocked: false, error: msg }
  }

  if (html.length < MIN_PAGE_SIZE) {
    return { category, url, tiles: [], extracted: 0, filtered: 0, passed: 0, blocked: true, error: 'page_too_small' }
  }
  if (ROBOT_SIGNALS.some(s => html.includes(s))) {
    return { category, url, tiles: [], extracted: 0, filtered: 0, passed: 0, blocked: true, error: 'robot_check' }
  }

  const tiles = extractTiles(html, category)
  return { category, url, tiles, extracted: tiles.length, filtered: 0, passed: 0, blocked: false }
}
