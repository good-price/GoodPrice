/**
 * GOODPRICE Audit — Quarantine Manager
 *
 * Reads and writes data/audit/quarantine.json.
 * Products in quarantine are NOT deleted — they are flagged for review.
 *
 * The quarantine system:
 *   - Adds a product to the quarantine list with a reason + timestamp
 *   - Does NOT modify the catalog files
 *   - Consumers (admin page, product pages) can check the quarantine list
 *     to optionally suppress a product from UI
 *
 * Storage: data/audit/quarantine.json
 * Locking: file writes are synchronous in Node (fs.writeFileSync) —
 *   safe in single-process Vercel lambdas. No concurrent writes expected.
 */

import fs   from 'fs'
import path from 'path'
import type { QuarantineEntry, QuarantineStore } from './types'
import { dataPath } from '@/lib/data-path'

// ── File path ─────────────────────────────────────────────────────────────────

const QUARANTINE_PATH = dataPath('data', 'audit', 'quarantine.json')

// ── Read ──────────────────────────────────────────────────────────────────────

/** Read the current quarantine store from disk. Returns empty store if file missing. */
export function getQuarantine(): QuarantineStore {
  try {
    const raw = fs.readFileSync(QUARANTINE_PATH, 'utf-8')
    return JSON.parse(raw) as QuarantineStore
  } catch {
    // File missing or malformed — return empty store
    return { updatedAt: new Date().toISOString(), entries: {} }
  }
}

/** Returns true if a product is currently quarantined */
export function isQuarantined(productId: string): boolean {
  const store = getQuarantine()
  return productId in store.entries
}

/** Returns the quarantine entry for a product, or null if not quarantined */
export function getQuarantineEntry(productId: string): QuarantineEntry | null {
  const store = getQuarantine()
  return store.entries[productId] ?? null
}

// ── Write ─────────────────────────────────────────────────────────────────────

function persistQuarantine(store: QuarantineStore): void {
  const dir = path.dirname(QUARANTINE_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(QUARANTINE_PATH, JSON.stringify(store, null, 2), 'utf-8')
}

/**
 * Add a product to quarantine.
 * If already quarantined, updates the reason and timestamp.
 */
export function quarantineProduct(entry: Omit<QuarantineEntry, 'quarantinedAt'>): QuarantineEntry {
  const store = getQuarantine()
  const full: QuarantineEntry = { ...entry, quarantinedAt: new Date().toISOString() }
  store.entries[entry.productId] = full
  store.updatedAt = new Date().toISOString()
  persistQuarantine(store)
  return full
}

/**
 * Remove a product from quarantine (un-quarantine / restore).
 * Returns true if the product was quarantined, false if it wasn't.
 */
export function unquarantineProduct(productId: string): boolean {
  const store = getQuarantine()
  if (!(productId in store.entries)) return false
  delete store.entries[productId]
  store.updatedAt = new Date().toISOString()
  persistQuarantine(store)
  return true
}

/**
 * Bulk-quarantine multiple products from an audit run.
 * Skips products that are already quarantined unless forceUpdate is true.
 */
export function bulkQuarantine(
  entries: Omit<QuarantineEntry, 'quarantinedAt'>[],
  options: { forceUpdate?: boolean } = {}
): { added: number; skipped: number } {
  const store  = getQuarantine()
  const now    = new Date().toISOString()
  let added    = 0
  let skipped  = 0

  for (const entry of entries) {
    if (!options.forceUpdate && entry.productId in store.entries) {
      skipped++
      continue
    }
    store.entries[entry.productId] = { ...entry, quarantinedAt: now }
    added++
  }

  if (added > 0) {
    store.updatedAt = now
    persistQuarantine(store)
  }

  return { added, skipped }
}

/** Clear all quarantine entries — use with caution (admin only) */
export function clearQuarantine(): void {
  const store: QuarantineStore = { updatedAt: new Date().toISOString(), entries: {} }
  persistQuarantine(store)
}
