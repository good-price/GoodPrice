/**
 * lib/tpe/vacancy.ts
 *
 * Sprint 4B — Vacancy Engine
 *
 * Detects under-representation in the Trusted Catalog and maintains a
 * persistent priority queue of vacancies for the Discovery Engine to fill.
 *
 * Responsibilities:
 *   - CRUD over data/tpe/vacancy-queue.json (VacancyQueueStore)
 *   - computeVacancies() — derive gaps from current catalog state
 *   - updateVacancy()    — patch a single vacancy record
 *   - closeVacancy()     — mark a vacancy as filled or closed
 *   - getVacanciesByPriority() — sorted view for Discovery Engine
 *   - computeKPI()       — aggregate KPI snapshot
 *
 * Priority rules:
 *   critical  deficit >= 6
 *   high      deficit >= 4
 *   medium    deficit >= 2
 *   low       deficit >= 1
 *
 * Vacancy Severity Score weights (per slot needed):
 *   critical  4 pts
 *   high      3 pts
 *   medium    2 pts
 *   low       1 pt
 *
 * Representation Balance: % of categories within ±2 of their target.
 */

import fs   from 'fs'
import path from 'path'
import { getTrustedCatalog } from '@/lib/tpe/catalog'
import type {
  VacancyQueueStore,
  Vacancy,
  VacancyPriority,
  VacancyStatus,
  CategoryRepresentation,
  VacancyKPI,
} from '@/types'

// ── Paths & constants ─────────────────────────────────────────────────────────

const QUEUE_PATH = path.resolve(process.cwd(), 'data/tpe/vacancy-queue.json')

export const DEFAULT_TARGET_PER_CATEGORY = 20

export const ALL_CATEGORIES: readonly string[] = [
  'electronica',
  'gaming',
  'hogar',
  'cocina',
  'deporte',
  'oficina',
  'belleza',
  'mascotas',
  'bebes',
  'herramientas',
] as const

/** Priority weight used in Vacancy Severity Score computation. */
export const PRIORITY_WEIGHT: Record<VacancyPriority, number> = {
  critical: 4,
  high:     3,
  medium:   2,
  low:      1,
}

/** Priority sort order (lower index = higher urgency). */
const PRIORITY_ORDER: Record<VacancyPriority, number> = {
  critical: 0,
  high:     1,
  medium:   2,
  low:      3,
}

// ── Read / write ──────────────────────────────────────────────────────────────

/** Load the VacancyQueueStore from disk. Returns an empty store on any error. */
export function getVacancyQueue(): VacancyQueueStore {
  try {
    const raw = fs.readFileSync(QUEUE_PATH, 'utf-8')
    return JSON.parse(raw) as VacancyQueueStore
  } catch {
    return emptyStore()
  }
}

/** Persist the VacancyQueueStore to disk, stamping `updatedAt`. */
export function saveVacancyQueue(store: VacancyQueueStore): void {
  const updated: VacancyQueueStore = { ...store, updatedAt: new Date().toISOString() }
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(updated, null, 2), 'utf-8')
}

// ── Core computation ──────────────────────────────────────────────────────────

export interface ComputeVacanciesOptions {
  /** Slots each category should have. Default: DEFAULT_TARGET_PER_CATEGORY (20) */
  targetPerCategory?: number
  /** Category list to consider. Default: ALL_CATEGORIES */
  allCategories?: readonly string[]
  /**
   * If true, compute and return the result but do NOT write to disk.
   * Existing open vacancies that are now filled will still be returned
   * with status='filled' in the result, but the store is not mutated.
   */
  dryRun?: boolean
}

export interface ComputeVacanciesResult {
  vacancies:        Vacancy[]
  categorySnapshot: CategoryRepresentation[]
  opened:           number    // new 'open' vacancies created
  updated:          number    // existing vacancies whose slotsNeeded changed
  filled:           number    // vacancies auto-closed because deficit → 0
  unchanged:        number    // vacancies with no change
}

/**
 * Compute the vacancy queue from the current Trusted Catalog state.
 *
 * Algorithm:
 *   1. Count catalog slots per category from trusted-catalog.json
 *   2. Compute delta = currentCount - targetCount per category
 *   3. For deficit categories (delta < 0):
 *        - If an open/in_progress vacancy already exists → update slotsNeeded + priority
 *        - Otherwise → create a new 'open' vacancy
 *   4. For categories that were previously deficit but are now balanced/surplus:
 *        - Auto-set existing open/in_progress vacancy to status='filled'
 *   5. Surplus / balanced categories → no vacancy, recorded in categorySnapshot only
 *   6. Save the updated store (unless dryRun)
 *
 * Returns the full result with diff counts.
 */
export function computeVacancies(
  options: ComputeVacanciesOptions = {},
): ComputeVacanciesResult {
  const {
    targetPerCategory = DEFAULT_TARGET_PER_CATEGORY,
    allCategories     = ALL_CATEGORIES,
    dryRun            = false,
  } = options

  const now = new Date().toISOString()

  // ── Step 1: Count catalog slots per category ──────────────────────────────

  const catalog     = getTrustedCatalog()
  const filled      = catalog.slots.filter(Boolean)
  const countByCat  = new Map<string, number>()
  for (const cat of allCategories) countByCat.set(cat, 0)
  for (const p of filled) {
    if (countByCat.has(p!.category)) {
      countByCat.set(p!.category, (countByCat.get(p!.category) ?? 0) + 1)
    }
  }

  // ── Step 2: Build category snapshot ──────────────────────────────────────

  const categorySnapshot: CategoryRepresentation[] = Array.from(allCategories).map(cat => {
    const currentCount = countByCat.get(cat) ?? 0
    const delta        = currentCount - targetPerCategory
    const status: CategoryRepresentation['status'] =
      delta < 0 ? 'deficit' : delta === 0 ? 'balanced' : 'surplus'
    return { category: cat, currentCount, targetCount: targetPerCategory, delta, status }
  })

  // ── Step 3: Merge with existing queue ─────────────────────────────────────

  const existing     = getVacancyQueue()
  const vacancyMap   = new Map<string, Vacancy>()
  for (const v of existing.vacancies) {
    vacancyMap.set(v.category, v)
  }

  let opened = 0, updated = 0, filled_ = 0, unchanged = 0
  const finalVacancies: Vacancy[] = []

  for (const snap of categorySnapshot) {
    const deficit  = -snap.delta  // positive when under-represented
    const existing = vacancyMap.get(snap.category)

    if (snap.status === 'deficit') {
      const priority = derivePriority(deficit)

      if (!existing || existing.status === 'filled' || existing.status === 'closed') {
        // Create new open vacancy
        finalVacancies.push({
          id:           `vac-${snap.category}`,
          category:     snap.category,
          priority,
          status:       'open',
          currentCount: snap.currentCount,
          targetCount:  targetPerCategory,
          slotsNeeded:  deficit,
          createdAt:    now,
          updatedAt:    now,
        })
        opened++
      } else {
        // Existing open/in_progress vacancy — update if anything changed
        const changed =
          existing.slotsNeeded  !== deficit   ||
          existing.priority     !== priority  ||
          existing.currentCount !== snap.currentCount
        finalVacancies.push({
          ...existing,
          priority,
          currentCount: snap.currentCount,
          targetCount:  targetPerCategory,
          slotsNeeded:  deficit,
          updatedAt:    now,
        })
        if (changed) updated++
        else unchanged++
      }
    } else {
      // Balanced or surplus — auto-close any open/in_progress vacancy
      if (existing && (existing.status === 'open' || existing.status === 'in_progress')) {
        finalVacancies.push({
          ...existing,
          status:       'filled',
          currentCount: snap.currentCount,
          slotsNeeded:  0,
          updatedAt:    now,
          closedAt:     now,
        })
        filled_++
      } else if (existing) {
        // Keep previously filled/closed record as-is (audit trail)
        finalVacancies.push(existing)
      }
      // No vacancy for balanced/surplus categories — not added if no prior record
    }
  }

  // ── Step 4: Persist ───────────────────────────────────────────────────────

  const newStore: VacancyQueueStore = {
    version:           existing.version ?? 1,
    updatedAt:         now,
    targetPerCategory,
    allCategories:     [...allCategories],
    vacancies:         finalVacancies,
    categorySnapshot,
  }

  if (!dryRun) {
    saveVacancyQueue(newStore)
  }

  return {
    vacancies:        finalVacancies,
    categorySnapshot,
    opened,
    updated,
    filled:           filled_,
    unchanged,
  }
}

// ── Single-vacancy mutations ──────────────────────────────────────────────────

/**
 * Apply a partial update to a vacancy identified by `id`.
 * Returns true if found and updated, false otherwise.
 * Always stamps `updatedAt`.
 */
export function updateVacancy(
  id:    string,
  patch: Partial<Omit<Vacancy, 'id' | 'category' | 'createdAt'>>,
): boolean {
  const store = getVacancyQueue()
  const index = store.vacancies.findIndex(v => v.id === id)
  if (index === -1) return false

  store.vacancies[index] = {
    ...store.vacancies[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  saveVacancyQueue(store)
  return true
}

/**
 * Mark a vacancy as closed (admin-triggered, not auto-filled).
 * Sets status='closed' and stamps closedAt.
 * Returns true if found and closed, false otherwise.
 */
export function closeVacancy(id: string): boolean {
  const now = new Date().toISOString()
  return updateVacancy(id, { status: 'closed', closedAt: now, slotsNeeded: 0 })
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Return vacancies filtered by status and sorted by priority (critical → low),
 * then by slotsNeeded descending within the same priority.
 *
 * Default: all 'open' and 'in_progress' vacancies.
 */
export function getVacanciesByPriority(
  statuses: VacancyStatus[] = ['open', 'in_progress'],
): Vacancy[] {
  const store = getVacancyQueue()
  return store.vacancies
    .filter(v => statuses.includes(v.status))
    .sort((a, b) => {
      const priDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (priDiff !== 0) return priDiff
      return b.slotsNeeded - a.slotsNeeded
    })
}

// ── KPI computation ───────────────────────────────────────────────────────────

/**
 * Compute the Vacancy KPI snapshot from the current queue + catalog state.
 *
 * Vacancy Severity Score (VSS):
 *   Σ(slotsNeeded × priorityWeight) for open/in_progress vacancies
 *   critical=4 · high=3 · medium=2 · low=1
 *
 * Representation Balance:
 *   % of categories whose currentCount is within ±2 of their target
 *   (100% = perfect balance, 0% = all categories misrepresented)
 */
export function computeKPI(): VacancyKPI {
  const store     = getVacancyQueue()
  const catalog   = getTrustedCatalog()
  const filled    = catalog.slots.filter(Boolean).length
  const active    = store.vacancies.filter(v => v.status === 'open' || v.status === 'in_progress')
  const totalCats = store.allCategories.length || ALL_CATEGORIES.length
  const target    = store.targetPerCategory || DEFAULT_TARGET_PER_CATEGORY
  const now       = new Date().toISOString()

  const vacancyCount     = active.length
  const totalSlotsNeeded = active.reduce((s, v) => s + v.slotsNeeded, 0)

  const vss = active.reduce((s, v) => s + v.slotsNeeded * PRIORITY_WEIGHT[v.priority], 0)

  const snap = store.categorySnapshot ?? []
  const balancedCount = snap.filter(s => Math.abs(s.delta) <= 2).length
  const repBalance    = totalCats > 0
    ? Math.round((balancedCount / totalCats) * 100 * 10) / 10
    : 0

  const deficitCategories = snap.filter(s => s.status === 'deficit')
    .sort((a, b) => a.delta - b.delta)  // most negative first
  const surplusCategories = snap.filter(s => s.status === 'surplus')
    .sort((a, b) => b.delta - a.delta)  // most positive first
  const balancedCategories = snap.filter(s => s.status === 'balanced')

  return {
    totalTargetSlots:      totalCats * target,
    filledSlots:           filled,
    vacancyCount,
    totalSlotsNeeded,
    vacancySeverityScore:  vss,
    representationBalance: repBalance,
    deficitCategories,
    surplusCategories,
    balancedCategories,
    computedAt:            now,
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function derivePriority(deficit: number): VacancyPriority {
  if (deficit >= 6) return 'critical'
  if (deficit >= 4) return 'high'
  if (deficit >= 2) return 'medium'
  return 'low'
}

function emptyStore(): VacancyQueueStore {
  return {
    version:           1,
    updatedAt:         new Date().toISOString(),
    targetPerCategory: DEFAULT_TARGET_PER_CATEGORY,
    allCategories:     [...ALL_CATEGORIES],
    vacancies:         [],
    categorySnapshot:  [],
  }
}
