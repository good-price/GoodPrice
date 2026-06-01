/**
 * lib/tpe/pool.ts
 *
 * CRUD layer for the Candidate Pool store (data/tpe/candidate-pool.json).
 *
 * All operations are synchronous filesystem reads/writes. This is intentional:
 * the pool is a local JSON file, not a database, and the synchronous API
 * makes it safe to use from both API routes and scripts without async plumbing.
 *
 * Callers that need bulk writes (e.g. the migration script) should:
 *   1. getCandidatePool()       — load once
 *   2. mutate store.candidates  — in memory
 *   3. saveCandidatePool(store) — write once
 * rather than calling addCandidate() N times (which does N read+write cycles).
 */

import fs from 'fs'
import path from 'path'
import type { CandidatePoolStore, CandidateRecord, CandidateStatus } from '@/types'

// ── Store path ────────────────────────────────────────────────────────────────

const POOL_PATH = path.resolve(process.cwd(), 'data/tpe/candidate-pool.json')

// ── Read / write ──────────────────────────────────────────────────────────────

/** Load the full Candidate Pool from disk. Returns an empty store on any error. */
export function getCandidatePool(): CandidatePoolStore {
  try {
    const raw = fs.readFileSync(POOL_PATH, 'utf-8')
    return JSON.parse(raw) as CandidatePoolStore
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), candidates: [] }
  }
}

/** Persist the full store to disk, updating `updatedAt` automatically. */
export function saveCandidatePool(store: CandidatePoolStore): void {
  const updated: CandidatePoolStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(POOL_PATH, JSON.stringify(updated, null, 2), 'utf-8')
}

// ── Single-record mutations ───────────────────────────────────────────────────

/**
 * Add a single candidate to the pool.
 * Returns { added: false } if a candidate with the same `id` or `asin` already
 * exists — the pool never contains duplicates on either dimension.
 *
 * Performs one full read+write cycle. For bulk inserts, use getCandidatePool()
 * + saveCandidatePool() directly.
 */
export function addCandidate(
  candidate: CandidateRecord,
): { added: boolean; reason?: string } {
  const store = getCandidatePool()

  const existsById = store.candidates.some(c => c.id === candidate.id)
  if (existsById) {
    return { added: false, reason: `duplicate id: ${candidate.id}` }
  }

  const existsByAsin = store.candidates.some(c => c.asin === candidate.asin)
  if (existsByAsin) {
    return { added: false, reason: `duplicate asin: ${candidate.asin}` }
  }

  store.candidates.push(candidate)
  saveCandidatePool(store)
  return { added: true }
}

/**
 * Apply a partial update to a candidate identified by `id`.
 * Returns true if the candidate was found and updated, false otherwise.
 *
 * Does NOT allow changing `id` or `asin` — those are immutable identifiers.
 */
export function updateCandidate(
  id: string,
  patch: Omit<Partial<CandidateRecord>, 'id' | 'asin'>,
): boolean {
  const store = getCandidatePool()
  const index = store.candidates.findIndex(c => c.id === id)
  if (index === -1) return false

  store.candidates[index] = { ...store.candidates[index], ...patch }
  saveCandidatePool(store)
  return true
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Find a candidate by its `id`. Returns null if not found. */
export function getCandidateById(id: string): CandidateRecord | null {
  const store = getCandidatePool()
  return store.candidates.find(c => c.id === id) ?? null
}

/** Return all candidates with a specific lifecycle status. */
export function getCandidatesByStatus(status: CandidateStatus): CandidateRecord[] {
  const store = getCandidatePool()
  return store.candidates.filter(c => c.status === status)
}

/** Return all candidates in a specific category slug. */
export function getCandidatesByCategory(category: string): CandidateRecord[] {
  const store = getCandidatePool()
  return store.candidates.filter(c => c.category === category)
}
