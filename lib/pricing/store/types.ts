/**
 * GOODPRICE Pricing — Store Interface
 *
 * PricingStore is the single persistence abstraction for the pricing layer.
 * All reads and writes go through this interface — never to raw files or
 * database clients directly.
 *
 * Current implementation: FileStore (JSON files in data/pricing/)
 * Future implementation:  SupabaseStore (Postgres via Supabase client)
 *
 * Swap strategy:
 *   Replace `lib/pricing/store/index.ts` singleton factory to return a
 *   SupabaseStore instead of FileStore. All callers remain unchanged.
 *
 * Design decisions:
 *   - All methods are async (even FileStore — prepares for I/O bound operations)
 *   - Snapshots are append-only (never updated, only read + queried)
 *   - Offers are upserted (one current offer per product×retailer)
 *   - Mappings are read-heavy, write-occasionally (seeded from JSON, updated via API)
 *   - History is derived (computed from snapshots, not stored as primary data)
 */

import type {
  PriceSnapshot,
  RetailerOffer,
  PriceHistoryPoint,
} from '../types'
import type { ProductMapping, MappingsStore } from '../ml/types'

// ── Store interface ───────────────────────────────────────────────────────────

export interface PricingStore {
  // ── Snapshots (append-only) ───────────────────────────────────────────────

  /**
   * Save a new price snapshot.
   * Snapshots are never updated — each call adds a new record.
   *
   * @param snapshot - Validated PriceSnapshot from the normalization pipeline
   */
  saveSnapshot(snapshot: PriceSnapshot): Promise<void>

  /**
   * Get all snapshots for a product, sorted by recordedAt ascending.
   *
   * @param productId  - Internal GOODPRICE product ID
   * @param retailerId - Optional: filter to a single retailer
   * @param limit      - Max records to return (default: 500)
   */
  getSnapshots(
    productId: string,
    retailerId?: string,
    limit?: number,
  ): Promise<PriceSnapshot[]>

  /**
   * Get the most recent snapshot for a product×retailer pair.
   * Returns null if no snapshots exist yet.
   */
  getLatestSnapshot(
    productId: string,
    retailerId: string,
  ): Promise<PriceSnapshot | null>

  // ── Offers (current state, upsert) ───────────────────────────────────────

  /**
   * Upsert the current offer for a product×retailer pair.
   * Creates if not exists; overwrites if exists.
   *
   * @param offer - Current RetailerOffer (replaces any previous offer for same key)
   */
  saveOffer(offer: RetailerOffer): Promise<void>

  /**
   * Get all current offers for a product.
   * Returns empty array if no offers exist.
   *
   * @param productId - Internal GOODPRICE product ID
   */
  getOffers(productId: string): Promise<RetailerOffer[]>

  /**
   * Get the current offer for a specific product×retailer pair.
   * Returns null if none exists.
   */
  getOffer(productId: string, retailerId: string): Promise<RetailerOffer | null>

  // ── Price history (derived/computed) ─────────────────────────────────────

  /**
   * Get aggregated daily price history for a product.
   * Derived from snapshots — each day = min/max/avg across all snapshots that day.
   *
   * @param productId - Internal GOODPRICE product ID
   * @param days      - How many days of history to return (default: 90)
   */
  getPriceHistory(
    productId: string,
    days?: number,
  ): Promise<PriceHistoryPoint[]>

  // ── Product mappings ──────────────────────────────────────────────────────

  /**
   * Load all product→ML item mappings.
   * Seeded from data/pricing/mappings.json; can be updated via API.
   */
  getMappings(): Promise<MappingsStore>

  /**
   * Get the mapping for a single catalog product.
   * Returns null if product has no mapping yet.
   *
   * @param productId - Internal GOODPRICE product ID
   */
  getMapping(productId: string): Promise<ProductMapping | null>

  /**
   * Save (create or update) a product→ML item mapping.
   *
   * @param mapping - Updated ProductMapping
   */
  saveMapping(mapping: ProductMapping): Promise<void>
}

// ── Snapshot query options ────────────────────────────────────────────────────

export interface SnapshotQuery {
  productId:   string
  retailerId?: string
  /** ISO date — only snapshots on or after this date */
  since?:      string
  /** Max records to return */
  limit?:      number
}

// ── Store error types ─────────────────────────────────────────────────────────

export class StoreError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'StoreError'
  }
}
