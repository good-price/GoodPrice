/**
 * PA-API Image Sync — patches catalog .ts files with official Amazon image URLs.
 *
 * Strategy:
 *   1. Load all raw products from the catalog
 *   2. Filter to those with stale/broken image URLs (unless forceRefresh)
 *   3. Check per-ASIN disk cache first (7-day TTL)
 *   4. Batch-fetch remaining ASINs from PA-API (10 ASINs per call)
 *   5. For each returned image URL, do a string replacement in the catalog file
 *   6. Persist a sync log to data/paapi/sync-log.json
 *
 * What counts as a "broken" image:
 *   - Legacy P/ASIN format: images-na.ssl-images-amazon.com/images/P/{ASIN}.01._SL500_.jpg
 *     → Returns 1×1 GIF for ~76% of newer ASINs
 *   - Old I/ CDN codes:    images-na.ssl-images-amazon.com/images/I/{code}._AC_..._.jpg
 *     → CDN codes are stale and return 404
 *
 * Catalog patching:
 *   - Reads the .ts file from disk, replaces the old URL string, writes it back
 *   - Safe: only replaces exact string matches; if URL not found → 'unchanged'
 *   - Does NOT reload modules — require() cache is not invalidated (restart needed)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getPaapiClient, IMAGE_RESOURCES } from './client'
import { getCached, setCached } from './cache'
import { extractSummary } from './types'
import { getRawProducts } from '@/data/catalog'
import type { RawProduct } from '@/types'
import type { PaapiSyncLog, PaapiSyncResult, PaapiSyncStatus } from './types'

// ── Paths ──────────────────────────────────────────────────────────────────────

const CATALOG_DIR  = join(process.cwd(), 'data', 'catalog')
const PAAPI_DIR    = join(process.cwd(), 'data', 'paapi')
const SYNC_LOG     = join(PAAPI_DIR, 'sync-log.json')

// ── Image URL classification ───────────────────────────────────────────────────

/**
 * Returns true if the image URL is likely stale or broken:
 *   - P/ASIN legacy format (unreliable — may return 1×1 GIF)
 *   - Old images-na.ssl-images-amazon.com/images/I/ CDN codes (stale 404s)
 */
export function isImageStale(url: string): boolean {
  if (!url) return true
  // P/ASIN legacy — unreliable
  if (/images-na\.ssl-images-amazon\.com\/images\/P\//.test(url)) return true
  // Old I/ CDN codes on either domain
  if (/images-na\.ssl-images-amazon\.com\/images\/I\//.test(url)) return true
  return false
}

/** Returns true if the URL looks like a confirmed official Amazon image */
export function isImageFresh(url: string): boolean {
  return /m\.media-amazon\.com\/images\/I\//.test(url)
}

// ── Catalog file patching ──────────────────────────────────────────────────────

/**
 * Replace `oldUrl` with `newUrl` in the catalog file for `category`.
 * Returns true if the file was actually modified.
 */
function patchCatalogFile(category: string, oldUrl: string, newUrl: string): boolean {
  const filePath = join(CATALOG_DIR, `${category}.ts`)
  if (!existsSync(filePath)) return false
  try {
    const content = readFileSync(filePath, 'utf-8')
    if (!content.includes(oldUrl)) return false
    const updated = content.split(oldUrl).join(newUrl)
    if (updated === content) return false
    writeFileSync(filePath, updated, 'utf-8')
    return true
  } catch {
    return false
  }
}

// ── Sync options ───────────────────────────────────────────────────────────────

export interface ImageSyncOptions {
  /** Restrict sync to specific product IDs. Defaults to all catalog products. */
  productIds?: string[]
  /** If true, skip cache and re-fetch from PA-API even for fresh entries. */
  forceRefresh?: boolean
  /** If true, compute what would change but don't write any files. */
  dryRun?: boolean
  /** Called after each product is processed (for progress bars in scripts). */
  onProgress?: (done: number, total: number, result: PaapiSyncResult) => void
}

// ── Main sync function ─────────────────────────────────────────────────────────

/**
 * Sync all stale image URLs in the catalog by fetching from PA-API.
 *
 * Safe to call concurrently — each product file is patched independently.
 * Graceful fallback: if PA-API is down, cached entries are used; errors are logged.
 */
export async function syncImages(options: ImageSyncOptions = {}): Promise<PaapiSyncLog> {
  ensurePaapiDir()

  const runId     = `sync-${Date.now()}`
  const startedAt = new Date().toISOString()
  const results: PaapiSyncResult[] = []

  // ── 1. Determine target products ────────────────────────────────────────────
  let products: RawProduct[] = getRawProducts()
  if (options.productIds?.length) {
    const ids = new Set(options.productIds)
    products = products.filter(p => ids.has(p.id))
  }

  // Only target stale images unless forceRefresh
  const targets = options.forceRefresh
    ? products
    : products.filter(p => isImageStale(p.image))

  const client = getPaapiClient()

  // ── 2. Resolve from cache first ─────────────────────────────────────────────
  const toFetch: RawProduct[] = []

  for (const product of targets) {
    if (!options.forceRefresh) {
      const cached = getCached(product.asin)
      if (cached?.item) {
        const newUrl = cached.item.Images?.Primary?.Large?.URL
        if (newUrl) {
          const status: PaapiSyncStatus = newUrl === product.image ? 'unchanged' : 'from_cache'
          const r: PaapiSyncResult = {
            asin: product.asin,
            productId: product.id,
            status,
            oldUrl: product.image,
            newUrl,
          }
          if (status === 'from_cache' && !options.dryRun) {
            patchCatalogFile(product.category, product.image, newUrl)
          }
          results.push(r)
          options.onProgress?.(results.length, targets.length, r)
          continue
        }
      }
    }
    toFetch.push(product)
  }

  // ── 3. Fetch remaining from PA-API ──────────────────────────────────────────
  if (toFetch.length > 0) {
    const asinToProduct = new Map(toFetch.map(p => [p.asin, p]))
    const asins = toFetch.map(p => p.asin)

    await client.getItemsBatch(asins, {
      resources: IMAGE_RESOURCES,

      onProgress: () => { /* batch-level progress tracked via results */ },

      onError: (batchAsins, error) => {
        for (const asin of batchAsins) {
          const product = asinToProduct.get(asin)!
          setCached(asin, null, error.message)
          const r: PaapiSyncResult = {
            asin,
            productId: product.id,
            status: 'api_error',
            error: error.message,
          }
          results.push(r)
          options.onProgress?.(results.length, targets.length, r)
        }
      },
    }).then(itemMap => {
      // Items returned by PA-API
      const returnedAsins = new Set(itemMap.keys())

      for (const [asin, item] of Array.from(itemMap)) {
        const product = asinToProduct.get(asin)
        if (!product) continue

        setCached(asin, item)
        const summary = extractSummary(item)
        const newUrl = summary.imageUrl

        if (!newUrl) {
          const r: PaapiSyncResult = { asin, productId: product.id, status: 'no_image' }
          results.push(r)
          options.onProgress?.(results.length, targets.length, r)
          return
        }

        if (newUrl === product.image) {
          const r: PaapiSyncResult = { asin, productId: product.id, status: 'unchanged', newUrl }
          results.push(r)
          options.onProgress?.(results.length, targets.length, r)
          return
        }

        const patched = options.dryRun
          ? true // pretend it worked in dry-run mode
          : patchCatalogFile(product.category, product.image, newUrl)

        const r: PaapiSyncResult = {
          asin,
          productId: product.id,
          status: patched ? 'updated' : 'unchanged',
          oldUrl: product.image,
          newUrl,
        }
        results.push(r)
        options.onProgress?.(results.length, targets.length, r)
      }

      // ASINs requested but not returned (not found / not eligible)
      for (const asin of asins) {
        if (!returnedAsins.has(asin)) {
          const product = asinToProduct.get(asin)!
          // Only add error result if not already added (batch errors above)
          if (!results.some(r => r.asin === asin)) {
            setCached(asin, null, 'Not returned by PA-API')
            const r: PaapiSyncResult = {
              asin,
              productId: product.id,
              status: 'api_error',
              error: 'ASIN not returned by PA-API (not eligible or not found in marketplace)',
            }
            results.push(r)
            options.onProgress?.(results.length, targets.length, r)
          }
        }
      }
    })
  }

  // ── 4. Build and persist log ─────────────────────────────────────────────────
  const completedAt = new Date().toISOString()

  const log: PaapiSyncLog = {
    runId,
    startedAt,
    completedAt,
    durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    totalTargets: targets.length,
    updated:   results.filter(r => r.status === 'updated').length,
    unchanged: results.filter(r => r.status === 'unchanged').length,
    noImage:   results.filter(r => r.status === 'no_image').length,
    errors:    results.filter(r => r.status === 'api_error').length,
    fromCache: results.filter(r => r.status === 'from_cache').length,
    results,
  }

  if (!options.dryRun) {
    writeFileSync(SYNC_LOG, JSON.stringify(log, null, 2), 'utf-8')
  }

  return log
}

// ── Log reader ─────────────────────────────────────────────────────────────────

export function getLastSyncLog(): PaapiSyncLog | null {
  if (!existsSync(SYNC_LOG)) return null
  try {
    return JSON.parse(readFileSync(SYNC_LOG, 'utf-8')) as PaapiSyncLog
  } catch {
    return null
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ensurePaapiDir(): void {
  if (!existsSync(PAAPI_DIR)) mkdirSync(PAAPI_DIR, { recursive: true })
  const cacheDir = join(PAAPI_DIR, 'cache')
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true })
}

/**
 * Returns a count of how many products in the catalog still have stale images.
 * Useful for quick health checks without a full sync.
 */
export function countStaleImages(): { stale: number; fresh: number; total: number } {
  const products = getRawProducts()
  let stale = 0, fresh = 0
  for (const p of products) {
    if (isImageStale(p.image)) stale++
    else fresh++
  }
  return { stale, fresh, total: products.length }
}
