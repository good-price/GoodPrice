/**
 * lib/tpe/discovery/vacancy-consumer.ts
 *
 * Sprint 5A — Discovery Lite
 *
 * Bridges the Discovery Engine and the Vacancy Queue.
 *
 * Functions:
 *   getOpenVacancies()   — sorted list of actionable vacancies (open | in_progress)
 *   getNextVacancy()     — single highest-priority vacancy (or null if queue empty)
 *   markDiscovering()    — set vacancy status → 'in_progress' when a run starts
 *   markCompleted()      — update counts after a run; auto-close if target reached
 *
 * Priority sort order: critical → high → medium → low.
 * Within the same priority: larger slotsNeeded first (most urgent gap).
 */

import { getVacancyQueue, saveVacancyQueue } from '@/lib/tpe/vacancy'
import type { Vacancy, VacancyPriority } from '@/types'

// ── Sort helpers ──────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<VacancyPriority, number> = {
  critical: 0,
  high:     1,
  medium:   2,
  low:      3,
}

function sortByPriority(a: Vacancy, b: Vacancy): number {
  const d = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  return d !== 0 ? d : b.slotsNeeded - a.slotsNeeded
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return all open or in_progress vacancies, sorted by priority then slotsNeeded.
 * This is the primary feed for the Discovery Engine.
 */
export function getOpenVacancies(): Vacancy[] {
  const store = getVacancyQueue()
  return store.vacancies
    .filter(v => v.status === 'open' || v.status === 'in_progress')
    .sort(sortByPriority)
}

/**
 * Return the single highest-priority open/in_progress vacancy, or null if the
 * queue is empty.  Useful for sequential (one-at-a-time) discovery strategies.
 */
export function getNextVacancy(): Vacancy | null {
  return getOpenVacancies()[0] ?? null
}

/**
 * Mark a vacancy as 'in_progress' when the Discovery Engine begins sourcing
 * candidates for it.  Idempotent if already in_progress.
 *
 * Returns true if the vacancy was found and updated, false otherwise.
 */
export function markDiscovering(vacancyId: string): boolean {
  const store = getVacancyQueue()
  const idx   = store.vacancies.findIndex(v => v.id === vacancyId)
  if (idx === -1) return false

  const now = new Date().toISOString()
  store.vacancies[idx] = {
    ...store.vacancies[idx],
    status:    'in_progress',
    updatedAt: now,
  }
  saveVacancyQueue(store)
  return true
}

/**
 * Update a vacancy after a discovery run completes.
 *
 * `insertedCount` — how many candidates were successfully inserted into the pool
 *   for this category in this run.  The vacancy's currentCount is NOT changed here
 *   (it reflects actual catalog slots, not pipeline candidates), but slotsNeeded
 *   is annotated so the queue shows pipeline progress.
 *
 * If the vacancy's category has now reached its target in the catalog (detected
 * by checking `newCatalogCount` when provided), it is auto-closed as 'filled'.
 *
 * Otherwise it stays 'in_progress' with a note that candidates are in the pipeline.
 *
 * Returns true if found and updated.
 */
export function markCompleted(
  vacancyId:       string,
  insertedCount:   number,
  newCatalogCount?: number,
): boolean {
  const store = getVacancyQueue()
  const idx   = store.vacancies.findIndex(v => v.id === vacancyId)
  if (idx === -1) return false

  const now = new Date().toISOString()
  const v   = store.vacancies[idx]

  // If the caller knows the actual new catalog count, use it to determine fill state
  const effectiveCount = newCatalogCount ?? v.currentCount
  const slotsNeeded    = Math.max(0, v.targetCount - effectiveCount)
  const isFilled       = slotsNeeded === 0

  store.vacancies[idx] = {
    ...v,
    status:       isFilled ? 'filled' : 'in_progress',
    currentCount: effectiveCount,
    slotsNeeded,
    updatedAt:    now,
    notes:        isFilled
      ? `Filled after discovery run — ${insertedCount} candidates inserted`
      : `${insertedCount} candidates in pipeline (status=pending, gates not yet run)`,
    ...(isFilled ? { closedAt: now } : {}),
  }
  saveVacancyQueue(store)
  return true
}
