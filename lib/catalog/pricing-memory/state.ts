/**
 * lib/catalog/pricing-memory/state.ts
 *
 * Price history and product intelligence persistence — Sprint 4E.
 *
 * Two stores:
 *   data/catalog/price-history.json        — per-product price snapshots
 *   data/catalog/product-intelligence.json — per-product analytics
 *
 * Both use OPS V3 atomic write (tmp → rename).
 * Fault-tolerant reads — never throw, return defaults on corrupt/missing files.
 *
 * SERVER-ONLY.
 */

import path from 'path'
import { storage } from '@/lib/storage/StorageFactory'
import type {
  PriceHistoryStore,
  ProductPriceHistory,
  PriceSnapshot,
  ProductIntelligenceStore,
  ProductIntelligence,
} from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const PRICE_HISTORY_FILE   = path.resolve(process.cwd(), 'data/catalog/price-history.json')
const INTELLIGENCE_FILE    = path.resolve(process.cwd(), 'data/catalog/product-intelligence.json')

/** Rolling window cap — oldest snapshots drop when this is exceeded. */
const MAX_SNAPSHOTS = 100

// ── Atomic write helper ───────────────────────────────────────────────────────

function atomicWrite(filePath: string, content: string): void {
  const tmp = filePath + '.tmp'
  storage.write(tmp, content)
  storage.rename(tmp, filePath)
}

// ── Price history ─────────────────────────────────────────────────────────────

function defaultPriceHistory(): PriceHistoryStore {
  return { updatedAt: null, products: {} }
}

function migratePriceHistory(raw: unknown): PriceHistoryStore {
  if (!raw || typeof raw !== 'object') return defaultPriceHistory()
  const r = raw as Record<string, unknown>

  const products: Record<string, ProductPriceHistory> = {}
  const rawProds = r['products']
  if (rawProds && typeof rawProds === 'object' && !Array.isArray(rawProds)) {
    for (const [asin, v] of Object.entries(rawProds as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const p = v as Record<string, unknown>

      const rawSnaps = p['snapshots']
      const snapshots: PriceSnapshot[] = Array.isArray(rawSnaps)
        ? (rawSnaps as unknown[]).filter(
            (s): s is PriceSnapshot =>
              s !== null && typeof s === 'object' &&
              typeof (s as Record<string, unknown>)['price'] === 'number' &&
              typeof (s as Record<string, unknown>)['timestamp'] === 'string',
          )
        : []

      products[asin] = {
        asin:         typeof p['asin']         === 'string' ? p['asin']         : asin,
        firstPrice:   typeof p['firstPrice']   === 'number' ? p['firstPrice']   : 0,
        latestPrice:  typeof p['latestPrice']  === 'number' ? p['latestPrice']  : 0,
        lowestPrice:  typeof p['lowestPrice']  === 'number' ? p['lowestPrice']  : 0,
        highestPrice: typeof p['highestPrice'] === 'number' ? p['highestPrice'] : 0,
        averagePrice: typeof p['averagePrice'] === 'number' ? p['averagePrice'] : 0,
        snapshots,
      }
    }
  }

  return {
    updatedAt: typeof r['updatedAt'] === 'string' ? r['updatedAt'] : null,
    products,
  }
}

export function readPriceHistory(): PriceHistoryStore {
  try {
    const raw = storage.read(PRICE_HISTORY_FILE)
    if (raw === null) return defaultPriceHistory()
    return migratePriceHistory(JSON.parse(raw))
  } catch {
    return defaultPriceHistory()
  }
}

export function savePriceHistory(store: PriceHistoryStore): void {
  try {
    atomicWrite(PRICE_HISTORY_FILE, JSON.stringify(store, null, 2))
  } catch {
    // best-effort — must never block callers
  }
}

/**
 * Records a new price observation for a product.
 *
 * Dedup: if the latest snapshot has the same price, the snapshot is skipped
 *        (no timestamp update — the price hasn't moved).
 * Cap:   if adding this snapshot exceeds MAX_SNAPSHOTS, the oldest one is dropped.
 *
 * Recomputes: firstPrice (immutable), latestPrice, lowestPrice,
 *             highestPrice, averagePrice.
 */
export function updatePriceHistory(asin: string, price: number, timestamp?: string): void {
  if (!isFinite(price) || price <= 0) return
  try {
    const store   = readPriceHistory()
    const now     = timestamp ?? new Date().toISOString()
    const existing = store.products[asin]

    // Dedup: skip if price unchanged since last snapshot
    if (existing) {
      const last = existing.snapshots.at(-1)
      if (last && last.price === price) {
        // Update latestPrice timestamp in store updatedAt only (no new snapshot)
        store.updatedAt = now
        savePriceHistory(store)
        return
      }
    }

    const prevSnaps = existing?.snapshots ?? []
    const newSnap:  PriceSnapshot = { price, timestamp: now }
    const snapshots = [...prevSnaps, newSnap].slice(-MAX_SNAPSHOTS)

    const prices = snapshots.map(s => s.price)
    const sum    = prices.reduce((a, b) => a + b, 0)

    const updated: ProductPriceHistory = {
      asin,
      firstPrice:   existing?.firstPrice ?? price,
      latestPrice:  price,
      lowestPrice:  Math.min(...prices),
      highestPrice: Math.max(...prices),
      averagePrice: Math.round((sum / prices.length) * 100) / 100,
      snapshots,
    }

    store.products[asin] = updated
    store.updatedAt      = now
    savePriceHistory(store)
  } catch {
    // best-effort
  }
}

// ── Product intelligence ──────────────────────────────────────────────────────

function defaultIntelligenceStore(): ProductIntelligenceStore {
  return { updatedAt: null, products: {} }
}

function migrateIntelligenceStore(raw: unknown): ProductIntelligenceStore {
  if (!raw || typeof raw !== 'object') return defaultIntelligenceStore()
  const r = raw as Record<string, unknown>

  const products: Record<string, ProductIntelligence> = {}
  const rawProds = r['products']
  if (rawProds && typeof rawProds === 'object' && !Array.isArray(rawProds)) {
    for (const [asin, v] of Object.entries(rawProds as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const p = v as Record<string, unknown>

      const trend = p['trend']
      const validTrend = trend === 'rising' || trend === 'falling' || trend === 'stable'
        ? trend as ProductIntelligence['trend']
        : 'stable'

      products[asin] = {
        asin:              typeof p['asin']              === 'string'  ? p['asin']              : asin,
        volatilityScore:   typeof p['volatilityScore']   === 'number'  ? p['volatilityScore']   : 0,
        opportunityScore:  typeof p['opportunityScore']  === 'number'  ? p['opportunityScore']  : 0,
        trend:             validTrend,
        lastPriceDropAt:   typeof p['lastPriceDropAt']   === 'string'  ? p['lastPriceDropAt']   : null,
        totalPriceChanges: typeof p['totalPriceChanges'] === 'number'  ? p['totalPriceChanges'] : 0,
      }
    }
  }

  return {
    updatedAt: typeof r['updatedAt'] === 'string' ? r['updatedAt'] : null,
    products,
  }
}

export function readProductIntelligence(): ProductIntelligenceStore {
  try {
    const raw = storage.read(INTELLIGENCE_FILE)
    if (raw === null) return defaultIntelligenceStore()
    return migrateIntelligenceStore(JSON.parse(raw))
  } catch {
    return defaultIntelligenceStore()
  }
}

export function saveProductIntelligence(store: ProductIntelligenceStore): void {
  try {
    atomicWrite(INTELLIGENCE_FILE, JSON.stringify(store, null, 2))
  } catch {
    // best-effort
  }
}

export function updateProductIntelligence(
  asin:    string,
  updates: Partial<Omit<ProductIntelligence, 'asin'>>,
): void {
  try {
    const store    = readProductIntelligence()
    const existing = store.products[asin]

    const defaults: ProductIntelligence = {
      asin,
      volatilityScore:   0,
      opportunityScore:  0,
      trend:             'stable',
      lastPriceDropAt:   null,
      totalPriceChanges: 0,
    }

    store.products[asin] = { ...defaults, ...existing, ...updates, asin }
    store.updatedAt      = new Date().toISOString()
    saveProductIntelligence(store)
  } catch {
    // best-effort
  }
}
