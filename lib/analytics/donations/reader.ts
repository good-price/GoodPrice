/**
 * lib/analytics/donations/reader.ts
 * SERVER-ONLY.
 */

import path from 'path'
import { storage } from '@/lib/storage/StorageFactory'
import type { DonationsStore, DonationProductStats } from './types'

const DONATIONS_FILE = path.resolve(process.cwd(), 'data/analytics/donations.json')

function defaultStore(): DonationsStore {
  return { updatedAt: null, products: {} }
}

export function readDonationsStore(): DonationsStore {
  const raw = storage.read(DONATIONS_FILE)
  if (raw === null) return defaultStore()
  try {
    const parsed = JSON.parse(raw) as DonationsStore
    if (typeof parsed !== 'object' || !parsed.products) return defaultStore()
    return parsed
  } catch {
    return defaultStore()
  }
}

export function getDonationStats(asin: string): DonationProductStats {
  try {
    const store = readDonationsStore()
    return store.products[asin] ?? {
      asin,
      impressions: 0,
      clicks:      0,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt:  new Date().toISOString(),
    }
  } catch {
    return {
      asin,
      impressions: 0,
      clicks:      0,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt:  new Date().toISOString(),
    }
  }
}

export function getDonationCTR(asin: string): number {
  try {
    const stats = getDonationStats(asin)
    if (stats.impressions === 0) return 0
    return Math.min(1, stats.clicks / stats.impressions)
  } catch {
    return 0
  }
}
