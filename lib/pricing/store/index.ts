/**
 * GOODPRICE Pricing — Store Singleton Factory
 *
 * Returns the active PricingStore implementation.
 * Swap this file to change the backing store — all consumers remain unchanged.
 *
 * Current: FileStore (JSON files — local dev / validation)
 * Future:  SupabaseStore (production Postgres persistence)
 *
 * Usage:
 *   import { getPricingStore } from '@/lib/pricing/store'
 *   const store = getPricingStore()
 *   await store.saveSnapshot(snapshot)
 *
 * The store is created lazily (on first call) and reused across requests
 * within the same Node.js process lifetime.
 *
 * Note: Server-side only. Do NOT import in client components or page layouts.
 * Import only inside API route handlers and server actions.
 */

import type { PricingStore } from './types'
import { FileStore } from './file-store'

// ── Singleton ─────────────────────────────────────────────────────────────────

let _store: PricingStore | null = null

/**
 * Get the active pricing store instance.
 * Uses FileStore in all environments until PRICING_STORE_ADAPTER env var
 * is set to 'supabase' (future).
 */
export function getPricingStore(): PricingStore {
  if (_store) return _store

  const adapter = process.env.PRICING_STORE_ADAPTER ?? 'file'

  if (adapter === 'file') {
    _store = new FileStore()
    return _store
  }

  // Future: SupabaseStore when PRICING_STORE_ADAPTER=supabase
  // if (adapter === 'supabase') {
  //   _store = new SupabaseStore(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!)
  //   return _store
  // }

  throw new Error(
    `Unknown PRICING_STORE_ADAPTER: "${adapter}". Supported: "file"`,
  )
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export type { PricingStore } from './types'
export { StoreError } from './types'
export { FileStore } from './file-store'
