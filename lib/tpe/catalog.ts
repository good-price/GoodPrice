/**
 * lib/tpe/catalog.ts
 *
 * Trusted Catalog management for the Trusted Product Engine.
 *
 * Responsibilities:
 *   - CRUD over data/tpe/trusted-catalog.json (TrustedCatalogStore)
 *   - Slot assignment and release (with pool synchronisation)
 *   - Full catalog rebuild from eligible candidates
 *   - KPI computation
 *
 * Admission rules (Phase 4):
 *   Priority 1 → status='approved'          (ACTIVE: all 9 gates passed)
 *   Priority 2 → status='approved_degraded' (IMAGE_DEGRADED: business gates only)
 *   Never admitted → 'rejected', 'exhausted', 'pending', 'evaluating'
 *
 * Side-effects on the Candidate Pool:
 *   - assignSlot() / rebuildCatalog()  → sets promoted candidates to 'in_catalog'
 *   - releaseSlot()                    → restores candidates to approved/approved_degraded
 */

import fs   from 'fs'
import path from 'path'
import { buildAsinUrl } from '@/lib/affiliate'
import { getCandidatePool, saveCandidatePool } from '@/lib/tpe/pool'
import type {
  TrustedCatalogStore,
  TrustedProduct,
  TrustedProductDisplayState,
  CandidateRecord,
  CandidateStatus,
} from '@/types'

// ── Paths & constants ─────────────────────────────────────────────────────────

const CATALOG_PATH = path.resolve(process.cwd(), 'data/tpe/trusted-catalog.json')

export const MAX_SLOTS = 200

// ── Read / write ──────────────────────────────────────────────────────────────

/** Load the TrustedCatalogStore from disk. */
export function getTrustedCatalog(): TrustedCatalogStore {
  try {
    const raw = fs.readFileSync(CATALOG_PATH, 'utf-8')
    return JSON.parse(raw) as TrustedCatalogStore
  } catch {
    return {
      version:   1,
      updatedAt: new Date().toISOString(),
      slots:     new Array(MAX_SLOTS).fill(null),
    }
  }
}

/** Persist the TrustedCatalogStore to disk, stamping `updatedAt`. */
export function saveTrustedCatalog(store: TrustedCatalogStore): void {
  const updated: TrustedCatalogStore = { ...store, updatedAt: new Date().toISOString() }
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(updated, null, 2), 'utf-8')
}

// ── Single-slot operations ────────────────────────────────────────────────────

/**
 * Promote a single approved candidate into the first available catalog slot.
 *
 * Rules:
 *   - Candidate must have status 'approved' or 'approved_degraded'
 *   - The candidate must have a lastBundle (gate results)
 *   - Finds the lowest-index null slot
 *
 * Writes both the catalog and the pool (marks candidate as 'in_catalog').
 * Returns the slotIndex assigned, or null if no slot is available / candidate ineligible.
 */
export function assignSlot(candidateId: string): number | null {
  const store = getTrustedCatalog()
  const pool  = getCandidatePool()

  const candidate = pool.candidates.find(c => c.id === candidateId)
  if (!candidate) return null
  if (candidate.status !== 'approved' && candidate.status !== 'approved_degraded') return null
  if (!candidate.lastBundle) return null

  const slotIndex = store.slots.findIndex(s => s === null)
  if (slotIndex === -1) return null  // catalog full

  const now = new Date().toISOString()
  store.slots[slotIndex] = buildTrustedProduct(candidate, slotIndex, now)
  saveTrustedCatalog(store)

  const updatedCandidates = pool.candidates.map(c =>
    c.id === candidateId ? { ...c, status: 'in_catalog' as CandidateStatus } : c,
  )
  saveCandidatePool({ ...pool, candidates: updatedCandidates })

  return slotIndex
}

/**
 * Release a catalog slot (free it for a new candidate).
 *
 * The product currently in the slot has its candidate status restored to
 * 'approved' or 'approved_degraded' based on its validationBundle.
 * If the release is part of an expulsion (business gate failure during
 * revalidation), the caller is responsible for separately setting the
 * candidate to 'rejected' in the pool.
 *
 * Writes both the catalog and the pool.
 */
export function releaseSlot(slotIndex: number): boolean {
  if (slotIndex < 0 || slotIndex >= MAX_SLOTS) return false

  const store = getTrustedCatalog()
  const product = store.slots[slotIndex]
  if (!product) return false  // already empty

  store.slots[slotIndex] = null
  saveTrustedCatalog(store)

  // Restore candidate status in pool
  const pool = getCandidatePool()
  const updatedCandidates = pool.candidates.map(c => {
    if (c.id !== product.id) return c
    const restoredStatus: CandidateStatus =
      product.displayState === 'active' ? 'approved' : 'approved_degraded'
    return { ...c, status: restoredStatus }
  })
  saveCandidatePool({ ...pool, candidates: updatedCandidates })

  return true
}

// ── Catalog rebuild ───────────────────────────────────────────────────────────

export interface RebuildOptions {
  /** If true, compute the catalog but do NOT write to disk. Default: false */
  dryRun?: boolean
  /** Maximum slots to fill. Default: MAX_SLOTS */
  maxSlots?: number
}

export interface RebuildReport {
  runAt:            string
  durationMs:       number
  dryRun:           boolean
  slotsAssigned:    number
  slotsEmpty:       number
  activeAssigned:   number
  degradedAssigned: number
  byCategory: {
    category:         string
    total:            number
    active:           number
    imageDegraded:    number
  }[]
  assignedProducts: {
    slotIndex:    number
    id:           string
    asin:         string
    category:     string
    displayState: TrustedProductDisplayState
    title:        string
  }[]
}

/**
 * Rebuild the Trusted Catalog from scratch using eligible candidates.
 *
 * Algorithm:
 *   1. Load all candidates from the pool
 *   2. Separate into ACTIVE (approved) and IMAGE_DEGRADED (approved_degraded)
 *   3. Sort each group by category (even distribution) then by reviews desc (relevance)
 *   4. Fill slots: ACTIVE first, then IMAGE_DEGRADED, up to maxSlots
 *   5. Mark assigned candidates as 'in_catalog' in the pool
 *   6. Restore previously in_catalog candidates that were not re-admitted
 *
 * Writes both the catalog and the pool (unless dryRun).
 */
export function rebuildCatalog(options: RebuildOptions = {}): RebuildReport {
  const startMs = Date.now()
  const runAt   = new Date().toISOString()
  const { dryRun = false, maxSlots = MAX_SLOTS } = options

  const pool = getCandidatePool()

  // Collect previously in_catalog candidates (to restore if not re-admitted)
  const prevInCatalog = new Set(
    pool.candidates.filter(c => c.status === 'in_catalog').map(c => c.id),
  )

  // Separate eligible candidates by tier
  const activeGroup    = pool.candidates.filter(c => c.status === 'approved')
  const degradedGroup  = pool.candidates.filter(c => c.status === 'approved_degraded')

  // Sort within each tier: by category (asc) then reviews (desc) for even distribution
  const sortFn = (a: CandidateRecord, b: CandidateRecord) =>
    a.category.localeCompare(b.category) || b.reviews - a.reviews

  const ordered: CandidateRecord[] = [
    ...activeGroup.slice().sort(sortFn),
    ...degradedGroup.slice().sort(sortFn),
  ]

  // Build new slots array (start empty)
  const newSlots: (TrustedProduct | null)[] = new Array(MAX_SLOTS).fill(null)
  const assignedIds = new Set<string>()
  const now = runAt

  for (let i = 0; i < Math.min(ordered.length, maxSlots); i++) {
    const candidate = ordered[i]
    newSlots[i] = buildTrustedProduct(candidate, i, now)
    assignedIds.add(candidate.id)
  }

  // Persist
  if (!dryRun) {
    saveTrustedCatalog({ version: 1, updatedAt: now, slots: newSlots })

    // Update pool: newly in_catalog, released from catalog
    const updatedCandidates = pool.candidates.map(c => {
      if (assignedIds.has(c.id)) {
        return { ...c, status: 'in_catalog' as CandidateStatus }
      }
      if (prevInCatalog.has(c.id) && !assignedIds.has(c.id)) {
        // Was in catalog before but not re-admitted — restore to approved state
        const restoredStatus: CandidateStatus =
          c.status === 'in_catalog'
            ? (c.lastBundle?.allPassed ? 'approved' : 'approved_degraded')
            : c.status
        return { ...c, status: restoredStatus }
      }
      return c
    })
    saveCandidatePool({ ...pool, candidates: updatedCandidates })
  }

  // Build report
  const assigned = newSlots.filter(Boolean) as TrustedProduct[]
  const catMap = new Map<string, { total: number; active: number; imageDegraded: number }>()
  for (const p of assigned) {
    const e = catMap.get(p.category) ?? { total: 0, active: 0, imageDegraded: 0 }
    e.total++
    if (p.displayState === 'active') e.active++
    else e.imageDegraded++
    catMap.set(p.category, e)
  }

  return {
    runAt,
    durationMs:       Date.now() - startMs,
    dryRun,
    slotsAssigned:    assigned.length,
    slotsEmpty:       MAX_SLOTS - assigned.length,
    activeAssigned:   assigned.filter(p => p.displayState === 'active').length,
    degradedAssigned: assigned.filter(p => p.displayState === 'image_degraded').length,
    byCategory: Array.from(catMap.entries())
      .map(([category, stats]) => ({ category, ...stats }))
      .sort((a, b) => b.total - a.total),
    assignedProducts: assigned.map(p => ({
      slotIndex:    p.slotIndex,
      id:           p.id,
      asin:         p.asin,
      category:     p.category,
      displayState: p.displayState,
      title:        p.title,
    })),
  }
}

// ── KPI ───────────────────────────────────────────────────────────────────────

export interface CatalogKPI {
  // Slots
  totalSlots:             200
  filledSlots:            number
  emptySlots:             number
  fillRatePercent:        number   // filledSlots / 200 * 100

  // Display state breakdown
  activeCount:            number   // displayState === 'active'
  imageDegradedCount:     number   // displayState === 'image_degraded'
  activePercent:          number   // activeCount / filledSlots * 100 (0 if empty)
  imageDegradedPercent:   number   // imageDegradedCount / filledSlots * 100 (0 if empty)

  // Category distribution
  byCategory: {
    category:      string
    total:         number
    active:        number
    imageDegraded: number
  }[]

  computedAt: string
}

/** Compute current catalog KPI from the on-disk state. */
export function getCatalogKPI(): CatalogKPI {
  const store   = getTrustedCatalog()
  const filled  = store.slots.filter(Boolean) as TrustedProduct[]
  const active  = filled.filter(p => p.displayState === 'active').length
  const degraded = filled.filter(p => p.displayState === 'image_degraded').length

  const catMap = new Map<string, { total: number; active: number; imageDegraded: number }>()
  for (const p of filled) {
    const e = catMap.get(p.category) ?? { total: 0, active: 0, imageDegraded: 0 }
    e.total++
    if (p.displayState === 'active') e.active++
    else e.imageDegraded++
    catMap.set(p.category, e)
  }

  return {
    totalSlots:           200,
    filledSlots:          filled.length,
    emptySlots:           MAX_SLOTS - filled.length,
    fillRatePercent:      (filled.length / MAX_SLOTS) * 100,
    activeCount:          active,
    imageDegradedCount:   degraded,
    activePercent:        filled.length > 0 ? (active / filled.length) * 100 : 0,
    imageDegradedPercent: filled.length > 0 ? (degraded / filled.length) * 100 : 0,
    byCategory: Array.from(catMap.entries())
      .map(([category, stats]) => ({ category, ...stats }))
      .sort((a, b) => b.total - a.total),
    computedAt: new Date().toISOString(),
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

const VALID_UNTIL_DAYS = 7

/** Build a TrustedProduct from a CandidateRecord for slot assignment. */
function buildTrustedProduct(
  candidate: CandidateRecord,
  slotIndex: number,
  now:       string,
): TrustedProduct {
  const validUntil = new Date(
    new Date(now).getTime() + VALID_UNTIL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const displayState: TrustedProductDisplayState =
    candidate.status === 'approved' || candidate.lastBundle?.allPassed
      ? 'active'
      : 'image_degraded'

  return {
    id:           candidate.id,
    asin:         candidate.asin,
    title:        candidate.title,
    category:     candidate.category,
    brand:        candidate.brand,
    image:        candidate.image,
    price:        candidate.price,
    oldPrice:     candidate.oldPrice,
    rating:       candidate.rating,
    reviews:      candidate.reviews,
    badge:        candidate.badge,
    isTopSeller:  candidate.isTopSeller,
    isOffer:      candidate.isOffer,
    description:  candidate.description,
    amazonUrl:    buildAsinUrl(candidate.asin),
    admittedAt:       now,
    lastValidatedAt:  now,
    validUntil,
    validationBundle: candidate.lastBundle!,
    slotIndex,
    displayState,
  }
}
