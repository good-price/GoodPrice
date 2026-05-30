/**
 * lib/catalog/intelligence/snapshot.ts
 *
 * Disk-backed intelligence snapshot for sync access in ISR pages.
 *
 * The intelligence engine is async (needs analytics). ISR pages are
 * synchronously rendered and cannot await async functions at render time.
 * This module bridges the gap:
 *
 *   Write path (async, triggered by admin or cron):
 *     generateIntelligenceReport() → buildSnapshot() → saveIntelligenceSnapshot()
 *
 *   Read path (sync, every ISR page render):
 *     getCachedSnapshot() → snapshot.rankMap[productId]
 *
 * Snapshot file: data/catalog/intelligence-snapshot.json
 *
 * The in-process cache has a 10-minute TTL. When Next.js triggers an ISR
 * revalidation the fresh render picks up any snapshot written in the
 * preceding 10 minutes without needing a server restart.
 *
 * Graceful degradation:
 *   If no snapshot file exists (first deploy, before admin generates one),
 *   getCachedSnapshot() returns null. All callers must fall back to
 *   default static ordering in this case. Nothing breaks.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { getAllProducts } from '@/data/catalog'
import { computeRankScore } from './ranking-engine'
import type { IntelligenceReport, ProductLifecycleState } from './types'
import type { Product } from '@/types'

// ── Snapshot shape ─────────────────────────────────────────────────────────────

export interface IntelligenceSnapshot {
  /** ISO timestamp of when this snapshot was generated */
  generatedAt: string
  /**
   * productId → composite rank score (0–1).
   * Higher is better. -1 means deprioritised (unhealthy / quarantined / archived).
   */
  rankMap: Record<string, number>
  /** productId → lifecycle state */
  lifecycleMap: Record<string, ProductLifecycleState>
  /**
   * Product IDs at CRITICAL severity in the suppression queue.
   * These products are auto-suppressed from all public surfaces (Gate 8 in public.ts).
   * High / medium severity items are shown in the admin queue only.
   */
  suppressedIds: string[]
  /**
   * Product IDs from the promotion queue, tier-sorted (best first).
   * Used to select featured products on the homepage and other surfaces.
   */
  promotedIds: string[]
  /** productId[] sorted best-first per category slug */
  categoryRankings: Record<string, string[]>
}

// ── File path ──────────────────────────────────────────────────────────────────

function getSnapshotPath(): string {
  return join(process.cwd(), 'data', 'catalog', 'intelligence-snapshot.json')
}

// ── Disk I/O ───────────────────────────────────────────────────────────────────

/**
 * Reads the snapshot from disk synchronously. Returns null if absent or corrupt.
 * Pure I/O — no caching. Use getCachedSnapshot() for hot paths.
 */
export function loadIntelligenceSnapshot(): IntelligenceSnapshot | null {
  const path = getSnapshotPath()
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as IntelligenceSnapshot
  } catch {
    return null
  }
}

/**
 * Writes the snapshot to disk. Creates data/catalog/ if it does not exist.
 * Called by POST /api/catalog/intelligence/snapshot after generateIntelligenceReport().
 */
export function saveIntelligenceSnapshot(snapshot: IntelligenceSnapshot): void {
  const path = getSnapshotPath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf8')
  } catch (err) {
    console.error('[intelligence/snapshot] Failed to write snapshot:', err)
    throw err
  }
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Extracts the runtime-relevant slice from a full IntelligenceReport.
 * Computes rank scores for every catalogued product using the full Product
 * objects (needed for freshness and catalog-boost sub-scores).
 */
export function buildSnapshot(report: IntelligenceReport): IntelligenceSnapshot {
  const products      = getAllProducts()
  const healthMap     = new Map(report.healthScores.map(h => [h.productId, h]))
  const engagementMap = new Map(report.engagementScores.map(e => [e.productId, e]))

  // Build rankMap — same formula as computeCategoryRankings but over ALL products
  const rankMap: Record<string, number> = {}
  for (const product of products) {
    const id         = product.id ?? ''
    const health     = healthMap.get(id)
    const engagement = engagementMap.get(id) ?? null
    const lifecycle  = report.lifecycleStates[id] ?? 'stale'
    if (!health) continue
    rankMap[id] = computeRankScore(product, health, engagement, lifecycle)
  }

  // Only CRITICAL severity items are auto-suppressed (Gate 8)
  const suppressedIds = report.suppressionQueue
    .filter(s => s.severity === 'critical')
    .map(s => s.productId)

  // Promotion queue — tier-sorted, best first
  const promotedIds = report.promotionQueue.map(p => p.productId)

  return {
    generatedAt:      report.generatedAt,
    rankMap,
    lifecycleMap:     { ...report.lifecycleStates },
    suppressedIds,
    promotedIds,
    categoryRankings: report.categoryRankings,
  }
}

// ── In-process cache ───────────────────────────────────────────────────────────

/** Refresh the in-memory copy from disk at most once per 10 minutes. */
const SNAPSHOT_CACHE_TTL = 10 * 60 * 1000

let _snapshotCached: IntelligenceSnapshot | null    = null
let _snapshotCacheTime                              = 0

/**
 * Returns the snapshot, refreshing from disk when the cache is stale (> 10 min).
 * Safe to call on every request — most calls hit the in-memory copy.
 * Returns null if no snapshot file has been written yet.
 */
export function getCachedSnapshot(): IntelligenceSnapshot | null {
  const now = Date.now()
  if (now - _snapshotCacheTime > SNAPSHOT_CACHE_TTL) {
    _snapshotCached    = loadIntelligenceSnapshot()
    _snapshotCacheTime = now
  }
  return _snapshotCached
}

// ── Snapshot-powered related products (for sync product pages) ─────────────────

const EXCLUDED_LIFECYCLE = new Set<ProductLifecycleState>(['quarantined', 'archived', 'unhealthy'])

/**
 * Returns related products for a product detail page using only the snapshot.
 * Simpler than getRelatedProducts() — no need for full health score arrays.
 *
 * Strategy:
 *   1. same brand + same category  (priority 0 — strongest signal)
 *   2. same category + price ≤ ±15%  (priority 1 — very similar)
 *   3. same category + price ≤ ±40%  (priority 2 — similar)
 *
 * Suppressed and degraded lifecycle products are excluded.
 * Results are sorted: priority asc → rankScore desc.
 */
export function getSnapshotRelatedProducts(
  target: Product,
  allPublicProducts: Product[],
  snapshot: IntelligenceSnapshot,
  limit = 4,
): Product[] {
  const suppressedSet = new Set(snapshot.suppressedIds)

  const candidates: Array<{ product: Product; priority: number; rankScore: number }> = []

  for (const p of allPublicProducts) {
    const id = p.id ?? ''
    if (id === (target.id ?? '')) continue
    if (suppressedSet.has(id)) continue

    const lifecycle = snapshot.lifecycleMap[id]
    if (lifecycle && EXCLUDED_LIFECYCLE.has(lifecycle)) continue

    const rankScore = snapshot.rankMap[id] ?? 0

    // Same brand + same category
    if (
      p.brand &&
      target.brand &&
      p.brand.toLowerCase() === target.brand.toLowerCase() &&
      p.category === target.category
    ) {
      candidates.push({ product: p, priority: 0, rankScore })
      continue
    }

    // Same category + similar price range
    if (p.category === target.category && target.price > 0 && p.price > 0) {
      const priceDiff = Math.abs(p.price - target.price) / target.price
      if (priceDiff <= 0.40) {
        candidates.push({ product: p, priority: priceDiff <= 0.15 ? 1 : 2, rankScore })
      }
    }
  }

  // Sort: priority asc → rankScore desc
  candidates.sort((a, b) => a.priority - b.priority || b.rankScore - a.rankScore)

  // Deduplicate by ID and take limit
  const seen   = new Set<string>()
  const result: Product[] = []
  for (const { product } of candidates) {
    const id = product.id ?? ''
    if (seen.has(id)) continue
    seen.add(id)
    result.push(product)
    if (result.length >= limit) break
  }

  return result
}
