/**
 * lib/catalog/discovery/candidate-store.ts
 *
 * Reads and writes discovery-candidates.json.
 * On Vercel the file lives in /tmp (ephemeral); locally it lives in
 * data/catalog/discovery-candidates.json (committed as an empty seed).
 *
 * Sprint 4C: mergeDiscoveryCandidates() now preserves intelligence tracking
 * fields (timesDiscovered, qualityScore, etc.) on every merge pass.
 * updateRejectedCandidates() increments timesRejected for ASINs that were
 * parsed but failed validation.
 */

import { storage } from '@/lib/storage/StorageFactory'
import { dataPath } from '@/lib/data-path'
import type { CandidateStore, DiscoveryCandidate } from './types'

function storePath(): string {
  return dataPath('data', 'catalog', 'discovery-candidates.json')
}

export function loadCandidates(): CandidateStore {
  const p = storePath()
  try {
    const raw = storage.read(p)
    if (raw === null) return { updatedAt: new Date().toISOString(), items: [] }
    return JSON.parse(raw) as CandidateStore
  } catch {
    return { updatedAt: new Date().toISOString(), items: [] }
  }
}

export function saveCandidates(candidates: DiscoveryCandidate[]): void {
  const store: CandidateStore = {
    updatedAt: new Date().toISOString(),
    items:     candidates,
  }
  const p = storePath()
  storage.write(p, JSON.stringify(store, null, 2))
}

/**
 * Merges new discovery candidates into the existing store by ASIN.
 *
 * Content merge rules (per ASIN):
 *   - New ASIN → add as-is
 *   - Existing ASIN, new has higher rating → update content + intelligence
 *   - Existing ASIN, same/lower rating but more reviews → update reviewCount + intelligence
 *   - No content improvement → update intelligence tracking only (no increment to `updated`)
 *
 * Intelligence merge (Sprint 4C):
 *   Intelligence fields from the incoming item are ALWAYS applied when defined,
 *   regardless of content comparison. firstDiscoveredAt is preserved as the
 *   earliest known date. timesAdmitted is never overwritten here (admission
 *   is tracked separately by the admission pipeline).
 *
 * Returns { added, updated } counts (content changes only).
 * Never throws.
 */
export function mergeDiscoveryCandidates(
  newItems: DiscoveryCandidate[],
): { added: number; updated: number } {
  try {
    const store    = loadCandidates()
    const existing = new Map<string, DiscoveryCandidate>()
    for (const item of store.items) existing.set(item.asin, item)

    let added     = 0
    let updated   = 0
    let anyChange = false

    for (const item of newItems) {
      const prev = existing.get(item.asin)

      if (!prev) {
        existing.set(item.asin, item)
        added++
        anyChange = true
        continue
      }

      // Build intelligence overlay from incoming item (always applied when defined)
      const intel: Partial<DiscoveryCandidate> = {
        // Preserve the earliest firstDiscoveredAt
        firstDiscoveredAt: item.firstDiscoveredAt ?? prev.firstDiscoveredAt,
        // Always take the latest lastDiscoveredAt
        ...(item.lastDiscoveredAt        !== undefined && { lastDiscoveredAt:        item.lastDiscoveredAt        }),
        ...(item.timesDiscovered         !== undefined && { timesDiscovered:         item.timesDiscovered         }),
        ...(item.timesValidated          !== undefined && { timesValidated:          item.timesValidated          }),
        ...(item.timesRejected           !== undefined && { timesRejected:           item.timesRejected           }),
        ...(item.qualityScore            !== undefined && { qualityScore:            item.qualityScore            }),
        ...(item.confidenceScore         !== undefined && { confidenceScore:         item.confidenceScore         }),
        ...(item.lastDiscoveryPipelineId !== undefined && { lastDiscoveryPipelineId: item.lastDiscoveryPipelineId }),
        ...(item.brand                   !== undefined && { brand:                   item.brand                   }),
        // Never overwrite timesAdmitted — admission pipeline owns this field
        timesAdmitted: prev.timesAdmitted,
      }

      const newRating   = item.rating      ?? 0
      const prevRating  = prev.rating      ?? 0
      const newReviews  = item.reviewCount ?? 0
      const prevReviews = prev.reviewCount ?? 0

      if (newRating > prevRating) {
        // Better rating → update content fields, apply intelligence overlay
        existing.set(item.asin, {
          ...item,
          discoveredAt:  prev.discoveredAt,          // preserve original discovery date
          reviewCount:   Math.max(newReviews, prevReviews),
          ...intel,
        })
        updated++
        anyChange = true
      } else if (newReviews > prevReviews) {
        existing.set(item.asin, { ...prev, reviewCount: newReviews, ...intel })
        updated++
        anyChange = true
      } else {
        // No content improvement — apply intelligence update only
        existing.set(item.asin, { ...prev, ...intel })
        anyChange = true
      }
    }

    if (anyChange) {
      saveCandidates(Array.from(existing.values()))
    }

    return { added, updated }
  } catch {
    return { added: 0, updated: 0 }
  }
}

/**
 * Increments timesRejected for ASINs that were parsed but failed validation.
 * Only updates candidates already in the store (rejected candidates that were
 * never previously discovered are ignored — they're not in the store yet).
 *
 * Sprint 4C. Atomic read-modify-write. Never throws.
 */
export function updateRejectedCandidates(rejectedAsins: string[]): void {
  if (rejectedAsins.length === 0) return
  try {
    const asinSet = new Set(rejectedAsins)
    const store   = loadCandidates()
    let   changed = false

    const items = store.items.map(item => {
      if (!asinSet.has(item.asin)) return item
      changed = true
      return { ...item, timesRejected: (item.timesRejected ?? 0) + 1 }
    })

    if (changed) saveCandidates(items)
  } catch {
    // best-effort
  }
}
