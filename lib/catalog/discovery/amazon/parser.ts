/**
 * lib/catalog/discovery/amazon/parser.ts
 *
 * Regex-based HTML parser for Amazon Best Sellers / New Releases / etc.
 * Sprint 4A.
 *
 * Strategy:
 *   1. Find every `data-asin="[A-Z0-9]{10}"` occurrence in the HTML.
 *   2. Slice the next 4 000 chars after each occurrence as the product block.
 *   3. Extract image, title, price, rating, reviews from that block.
 *   4. Deduplicate by ASIN.
 *   5. Return ParsedProduct[].
 *
 * Falls back gracefully when individual fields are missing.
 * Never throws. Returns [] on any error.
 *
 * SERVER-ONLY.
 */

import type { ParsedProduct, ScrapeResult } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Characters to scan after the data-asin tag for field extraction. */
const BLOCK_SIZE = 4_000

/** Minimum characters for a product block to be worth parsing. */
const MIN_BLOCK  = 300

// ── Field extractors ──────────────────────────────────────────────────────────

function extractImage(block: string): string | null {
  // Primary: Amazon CDN image in src
  const cdnPat = /src="(https:\/\/m\.media-amazon\.com\/images\/[^"]{20,})"/
  const m1     = cdnPat.exec(block)
  if (m1) return m1[1]!.split('._')[0]! + '.jpg'   // strip resize suffix

  // Fallback: any https image in the block
  const m2 = /src="(https:\/\/[^"]+\.(?:jpg|png|webp|jpeg)(?:\?[^"]*)?)"/.exec(block)
  return m2 ? m2[1]! : null
}

function extractTitle(block: string): string {
  // 1. aria-label on the product link (most reliable)
  const aria = /aria-label="([^"]{10,200})"/.exec(block)
  if (aria) return decodeHtml(aria[1]!)

  // 2. alt text on the product image
  const alt = /alt="([^"]{5,200})"/.exec(block)
  if (alt) {
    const t = alt[1]!
    if (!t.toLowerCase().includes('star') && !t.toLowerCase().includes('rating')) {
      return decodeHtml(t)
    }
  }

  // 3. Text inside common title class patterns
  const classPatterns = [
    /_p13n-sc-css-line-clamp[^>]*>([^<]{10,200})</,
    /class="[^"]*truncate[^"]*"[^>]*>([^<]{10,200})</,
    /class="[^"]*product-title[^"]*"[^>]*>([^<]{10,200})</,
    /class="[^"]*a-size-base[^"]*a-color-base[^"]*"[^>]*>([^<]{10,200})</,
  ]
  for (const pat of classPatterns) {
    const m = pat.exec(block)
    if (m) return decodeHtml(m[1]!.trim())
  }

  return ''
}

function extractPrice(block: string): number {
  // Patterns: $29.99 | $1,299 | "29.99" in a price span
  const patterns = [
    /\$\s*([\d]{1,4}(?:,\d{3})*(?:\.\d{2})?)/,
    /p13n-sc-price[^>]*>(?:[^<]*<[^>]+>)*\s*\$([\d,]+\.?\d*)/,
    /class="[^"]*price[^"]*"[^>]*>\s*\$([\d,]+\.?\d*)/,
  ]
  for (const pat of patterns) {
    const m = pat.exec(block)
    if (m) {
      const raw = m[1]!.replace(/,/g, '')
      const n   = parseFloat(raw)
      if (!isNaN(n) && n > 0 && n < 50_000) return n
    }
  }
  return 0
}

function extractRating(block: string): number {
  const m = /([\d.]+)\s+out\s+of\s+5\s+stars/i.exec(block)
  if (!m) return 0
  const n = parseFloat(m[1]!)
  return isNaN(n) || n < 0 || n > 5 ? 0 : n
}

function extractReviews(block: string): number {
  const patterns = [
    /([\d,]+)\s+(?:global\s+)?ratings?/i,
    /([\d,]+)\s+reviews?/i,
    /\((\d[\d,]*)\)/,   // "(1,234)" next to stars
  ]
  for (const pat of patterns) {
    const m = pat.exec(block)
    if (m) {
      const n = parseInt(m[1]!.replace(/,/g, ''), 10)
      if (!isNaN(n) && n >= 0) return n
    }
  }
  return 0
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g,    ' ')
    .trim()
}

// ── ASIN block extractor ──────────────────────────────────────────────────────

function extractBlocks(html: string): Array<{ asin: string; block: string }> {
  const blocks: Array<{ asin: string; block: string }> = []
  const asinRe = /data-asin="([A-Z0-9]{10})"/g
  let match: RegExpExecArray | null

  while ((match = asinRe.exec(html)) !== null) {
    const asin  = match[1]!
    const start = match.index
    const block = html.slice(start, start + BLOCK_SIZE)
    if (block.length >= MIN_BLOCK) {
      blocks.push({ asin, block })
    }
  }

  return blocks
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parses Amazon HTML into ParsedProduct[].
 *
 * Deduplicates by ASIN (first occurrence wins).
 * Ignores products with no ASIN.
 * Never throws.
 */
export function parseDiscoveryHtml(scrapeResult: ScrapeResult): ParsedProduct[] {
  try {
    if (!scrapeResult.success || !scrapeResult.html) return []

    const blocks     = extractBlocks(scrapeResult.html)
    const seen       = new Set<string>()
    const products:  ParsedProduct[] = []
    const now        = new Date().toISOString()

    for (const { asin, block } of blocks) {
      if (seen.has(asin)) continue
      seen.add(asin)

      const product: ParsedProduct = {
        asin,
        title:       extractTitle(block),
        image:       extractImage(block),
        price:       extractPrice(block),
        rating:      extractRating(block),
        reviews:     extractReviews(block),
        sourceUrl:   scrapeResult.source.url,
        sourceType:  scrapeResult.source.type,
        discoveredAt: now,
      }

      products.push(product)
    }

    return products
  } catch {
    return []
  }
}
