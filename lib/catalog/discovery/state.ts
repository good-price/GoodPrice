/**
 * lib/catalog/discovery/state.ts
 *
 * Discovery State persistence — Sprint 4B.
 *
 * Tracks the result of the last Amazon Discovery run per category.
 * Persisted to data/catalog/discovery-state.json using OPS V3 atomic writes.
 *
 * Fault-tolerant readers: never throw, return defaults on missing/corrupt file.
 * SERVER-ONLY.
 */

import { storage } from '@/lib/storage/StorageFactory'
import path from 'path'

const STATE_FILE = path.resolve(process.cwd(), 'data/catalog/discovery-state.json')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoveryCategoryState {
  category:       string
  lastRunAt:      string | null
  lastStatus:     'success' | 'partial' | 'failed' | null
  lastDurationMs: number
  lastParsed:     number
  lastValidated:  number
  lastSaved:      number
  lastWarnings:   string[]
  lastErrors:     string[]
}

export interface DiscoveryStateFile {
  updatedAt:  string | null
  categories: Record<string, DiscoveryCategoryState>
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function defaultCategoryState(category: string): DiscoveryCategoryState {
  return {
    category,
    lastRunAt:      null,
    lastStatus:     null,
    lastDurationMs: 0,
    lastParsed:     0,
    lastValidated:  0,
    lastSaved:      0,
    lastWarnings:   [],
    lastErrors:     [],
  }
}

function defaultState(): DiscoveryStateFile {
  return { updatedAt: null, categories: {} }
}

// ── Migration ─────────────────────────────────────────────────────────────────

function migrateState(raw: unknown): DiscoveryStateFile {
  if (!raw || typeof raw !== 'object') return defaultState()
  const r = raw as Record<string, unknown>

  const categories: Record<string, DiscoveryCategoryState> = {}
  const rawCats = r['categories']
  if (rawCats && typeof rawCats === 'object' && !Array.isArray(rawCats)) {
    for (const [k, v] of Object.entries(rawCats as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const cat    = v as Record<string, unknown>
      const status = cat['lastStatus']
      categories[k] = {
        category:       typeof cat['category']       === 'string' ? cat['category']       : k,
        lastRunAt:      typeof cat['lastRunAt']      === 'string' ? cat['lastRunAt']      : null,
        lastStatus:
          status === 'success' || status === 'partial' || status === 'failed' ? status : null,
        lastDurationMs: typeof cat['lastDurationMs'] === 'number' ? cat['lastDurationMs'] : 0,
        lastParsed:     typeof cat['lastParsed']     === 'number' ? cat['lastParsed']     : 0,
        lastValidated:  typeof cat['lastValidated']  === 'number' ? cat['lastValidated']  : 0,
        lastSaved:      typeof cat['lastSaved']      === 'number' ? cat['lastSaved']      : 0,
        lastWarnings:   Array.isArray(cat['lastWarnings']) ? (cat['lastWarnings'] as string[]) : [],
        lastErrors:     Array.isArray(cat['lastErrors'])   ? (cat['lastErrors']   as string[]) : [],
      }
    }
  }

  return {
    updatedAt:  typeof r['updatedAt'] === 'string' ? r['updatedAt'] : null,
    categories,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function readDiscoveryState(): DiscoveryStateFile {
  try {
    const raw = storage.read(STATE_FILE)
    if (raw === null) return defaultState()
    return migrateState(JSON.parse(raw))
  } catch {
    return defaultState()
  }
}

export function saveDiscoveryState(state: DiscoveryStateFile): void {
  try {
    const tmp = STATE_FILE + '.tmp'
    storage.write(tmp, JSON.stringify(state, null, 2))
    storage.rename(tmp, STATE_FILE)
  } catch {
    // best-effort; OPS continuity must never block on state writes
  }
}

export function updateDiscoveryCategoryState(
  category: string,
  result: {
    status:     'success' | 'partial' | 'failed'
    durationMs: number
    parsed:     number
    validated:  number
    saved:      number
    warnings:   string[]
    errors:     string[]
  },
): void {
  try {
    const state = readDiscoveryState()
    state.categories[category] = {
      category,
      lastRunAt:      new Date().toISOString(),
      lastStatus:     result.status,
      lastDurationMs: result.durationMs,
      lastParsed:     result.parsed,
      lastValidated:  result.validated,
      lastSaved:      result.saved,
      lastWarnings:   result.warnings,
      lastErrors:     result.errors,
    }
    state.updatedAt = new Date().toISOString()
    saveDiscoveryState(state)
  } catch {
    // best-effort
  }
}

export { defaultCategoryState }
