/**
 * lib/analytics/donations/writer.ts
 * SERVER-ONLY.
 */

import path from 'path'
import { storage } from '@/lib/storage/StorageFactory'
import { readDonationsStore } from './reader'
import type { DonationsStore } from './types'

const DONATIONS_FILE = path.resolve(process.cwd(), 'data/analytics/donations.json')

function saveDonationsStore(store: DonationsStore): void {
  try {
    const tmp = DONATIONS_FILE + '.tmp'
    storage.write(tmp, JSON.stringify(store, null, 2))
    storage.rename(tmp, DONATIONS_FILE)
  } catch {
    // best-effort — analytics must never block product pages
  }
}

export function recordImpression(asin: string): void {
  try {
    const store    = readDonationsStore()
    const now      = new Date().toISOString()
    const existing = store.products[asin]
    store.products[asin] = {
      asin,
      impressions: (existing?.impressions ?? 0) + 1,
      clicks:      existing?.clicks      ?? 0,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt:  now,
    }
    store.updatedAt = now
    saveDonationsStore(store)
  } catch {
    // best-effort
  }
}

export function recordClick(asin: string): void {
  try {
    const store    = readDonationsStore()
    const now      = new Date().toISOString()
    const existing = store.products[asin]
    store.products[asin] = {
      asin,
      impressions: existing?.impressions ?? 0,
      clicks:      (existing?.clicks ?? 0) + 1,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt:  now,
    }
    store.updatedAt = now
    saveDonationsStore(store)
  } catch {
    // best-effort
  }
}
