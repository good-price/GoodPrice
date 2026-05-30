/**
 * GOODPRICE Pricing — File-Based Store Implementation
 *
 * Persists pricing data as JSON files under data/pricing/:
 *
 *   data/pricing/
 *     mappings.json          — productId → ProductMapping (seeded, updatable)
 *     snapshots/
 *       {productId}.json     — PriceSnapshot[] for that product (append-only)
 *     offers/
 *       {productId}.json     — RetailerOffer[] current offers per product
 *
 * Design constraints:
 *   - Single-process only (no file locking — race conditions acceptable in dev)
 *   - All files are valid JSON (empty state = `[]` or `{}`)
 *   - Files are created on first write (directories created recursively)
 *   - No external dependencies — uses Node.js `fs/promises` only
 *
 * Production swap: implement PricingStore against Supabase, swap in index.ts.
 * The file store is ONLY for local development and validation.
 *
 * Note: This file runs server-side only (Next.js API routes / Vercel Cron).
 * Never import it in client-side code or page components.
 */

import fs from 'fs/promises'
import path from 'path'
import type { PricingStore } from './types'
import type { PriceSnapshot, RetailerOffer, PriceHistoryPoint } from '../types'
import type { ProductMapping, MappingsStore } from '../ml/types'
import { StoreError } from './types'

// ── Path configuration ────────────────────────────────────────────────────────

const DATA_ROOT    = path.join(process.cwd(), 'data', 'pricing')
const MAPPINGS_PATH = path.join(DATA_ROOT, 'mappings.json')
const SNAPSHOTS_DIR = path.join(DATA_ROOT, 'snapshots')
const OFFERS_DIR    = path.join(DATA_ROOT, 'offers')

// ── File helpers ──────────────────────────────────────────────────────────────

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

async function readJSON<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultValue
    throw new StoreError(
      `Failed to read ${filePath}`,
      'readJSON',
      err,
    )
  }
}

async function writeJSON<T>(filePath: string, data: T): Promise<void> {
  try {
    await ensureDir(path.dirname(filePath))
    const content = JSON.stringify(data, null, 2)
    await fs.writeFile(filePath, content, 'utf-8')
  } catch (err) {
    throw new StoreError(
      `Failed to write ${filePath}`,
      'writeJSON',
      err,
    )
  }
}

// ── PriceHistoryPoint aggregation ─────────────────────────────────────────────

/**
 * Aggregate an array of snapshots into daily PriceHistoryPoints.
 * Multiple snapshots on the same day → one point with min/max/avg.
 */
function aggregateToHistory(
  snapshots: PriceSnapshot[],
  days: number,
): PriceHistoryPoint[] {
  if (snapshots.length === 0) return []

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  const cutoff = cutoffDate.toISOString().slice(0, 10)

  // Group by date (YYYY-MM-DD)
  const byDate = new Map<string, PriceSnapshot[]>()
  for (const snap of snapshots) {
    const date = snap.recordedAt.slice(0, 10)
    if (date < cutoff) continue
    const existing = byDate.get(date)
    if (existing) existing.push(snap)
    else byDate.set(date, [snap])
  }

  // Convert each date group to a PriceHistoryPoint
  const points: PriceHistoryPoint[] = []
  const sortedDates = Array.from(byDate.keys()).sort()

  for (const date of sortedDates) {
    const daySnaps = byDate.get(date)!
    const prices   = daySnaps.map(s => s.priceUSD)

    const lowestPriceUSD  = Math.min(...prices)
    const highestPriceUSD = Math.max(...prices)
    const averagePriceUSD = Math.round(
      (prices.reduce((s, v) => s + v, 0) / prices.length) * 100,
    ) / 100

    const bestSnap = daySnaps.find(s => s.priceUSD === lowestPriceUSD) ?? daySnaps[0]
    const lastSnap = daySnaps[daySnaps.length - 1]

    points.push({
      date,
      lowestPriceUSD,
      highestPriceUSD,
      averagePriceUSD,
      bestRetailerId:        bestSnap.retailerId,
      endOfDayAvailability:  lastSnap.availability,
      snapshotCount:         daySnaps.length,
    })
  }

  return points
}

// ── FileStore implementation ──────────────────────────────────────────────────

export class FileStore implements PricingStore {
  // ── Snapshots ─────────────────────────────────────────────────────────────

  async saveSnapshot(snapshot: PriceSnapshot): Promise<void> {
    const filePath = path.join(SNAPSHOTS_DIR, `${snapshot.productId}.json`)
    const existing = await readJSON<PriceSnapshot[]>(filePath, [])
    existing.push(snapshot)
    await writeJSON(filePath, existing)
  }

  async getSnapshots(
    productId: string,
    retailerId?: string,
    limit = 500,
  ): Promise<PriceSnapshot[]> {
    const filePath = path.join(SNAPSHOTS_DIR, `${productId}.json`)
    const all = await readJSON<PriceSnapshot[]>(filePath, [])

    const filtered = retailerId
      ? all.filter(s => s.retailerId === retailerId)
      : all

    return filtered.slice(-limit)
  }

  async getLatestSnapshot(
    productId: string,
    retailerId: string,
  ): Promise<PriceSnapshot | null> {
    const snapshots = await this.getSnapshots(productId, retailerId, 500)
    return snapshots[snapshots.length - 1] ?? null
  }

  // ── Offers ────────────────────────────────────────────────────────────────

  async saveOffer(offer: RetailerOffer): Promise<void> {
    const filePath = path.join(OFFERS_DIR, `${offer.productId}.json`)
    const existing = await readJSON<RetailerOffer[]>(filePath, [])

    // Upsert: replace existing offer for same retailer, or append
    const idx = existing.findIndex(
      o => o.retailerId === offer.retailerId,
    )
    if (idx >= 0) existing[idx] = offer
    else existing.push(offer)

    await writeJSON(filePath, existing)
  }

  async getOffers(productId: string): Promise<RetailerOffer[]> {
    const filePath = path.join(OFFERS_DIR, `${productId}.json`)
    return readJSON<RetailerOffer[]>(filePath, [])
  }

  async getOffer(
    productId: string,
    retailerId: string,
  ): Promise<RetailerOffer | null> {
    const offers = await this.getOffers(productId)
    return offers.find(o => o.retailerId === retailerId) ?? null
  }

  // ── Price history ─────────────────────────────────────────────────────────

  async getPriceHistory(
    productId: string,
    days = 90,
  ): Promise<PriceHistoryPoint[]> {
    const snapshots = await this.getSnapshots(productId)
    return aggregateToHistory(snapshots, days)
  }

  // ── Mappings ──────────────────────────────────────────────────────────────

  async getMappings(): Promise<MappingsStore> {
    return readJSON<MappingsStore>(MAPPINGS_PATH, {})
  }

  async getMapping(productId: string): Promise<ProductMapping | null> {
    const mappings = await this.getMappings()
    return mappings[productId] ?? null
  }

  async saveMapping(mapping: ProductMapping): Promise<void> {
    const mappings = await this.getMappings()
    mappings[mapping.productId] = mapping
    await writeJSON(MAPPINGS_PATH, mappings)
  }
}
