/**
 * lib/catalog/discovery/metrics.ts
 *
 * Discovery Metrics — Sprint 4C.
 *
 * Tracks cumulative Amazon Discovery statistics per category.
 * Uses Welford's online algorithm for accurate streaming averages without
 * storing all historical data points.
 *
 * Persisted to data/catalog/discovery-metrics.json with OPS V3 atomic writes.
 * Fault-tolerant readers: never throw, return defaults on missing/corrupt file.
 *
 * SERVER-ONLY.
 */

import { storage } from '@/lib/storage/StorageFactory'
import path from 'path'

const METRICS_FILE = path.resolve(process.cwd(), 'data/catalog/discovery-metrics.json')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CategoryDiscoveryMetrics {
  category:       string
  totalRuns:      number
  successfulRuns: number
  partialRuns:    number
  failedRuns:     number
  totalParsed:    number
  totalValidated: number
  totalSaved:     number
  totalRejected:  number
  averageDurationMs: number  // Welford online mean
  lastRunAt:      string | null
}

export interface DiscoveryMetricsFile {
  updatedAt:  string | null
  categories: Record<string, CategoryDiscoveryMetrics>
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function defaultCategoryMetrics(category: string): CategoryDiscoveryMetrics {
  return {
    category,
    totalRuns:      0,
    successfulRuns: 0,
    partialRuns:    0,
    failedRuns:     0,
    totalParsed:    0,
    totalValidated: 0,
    totalSaved:     0,
    totalRejected:  0,
    averageDurationMs: 0,
    lastRunAt:      null,
  }
}

function defaultMetrics(): DiscoveryMetricsFile {
  return { updatedAt: null, categories: {} }
}

// ── Migration ─────────────────────────────────────────────────────────────────

function migrateMetrics(raw: unknown): DiscoveryMetricsFile {
  if (!raw || typeof raw !== 'object') return defaultMetrics()
  const r = raw as Record<string, unknown>

  const categories: Record<string, CategoryDiscoveryMetrics> = {}
  const rawCats = r['categories']
  if (rawCats && typeof rawCats === 'object' && !Array.isArray(rawCats)) {
    for (const [k, v] of Object.entries(rawCats as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const m = v as Record<string, unknown>
      categories[k] = {
        category:          typeof m['category']          === 'string' ? m['category']          : k,
        totalRuns:         typeof m['totalRuns']         === 'number' ? m['totalRuns']         : 0,
        successfulRuns:    typeof m['successfulRuns']    === 'number' ? m['successfulRuns']    : 0,
        partialRuns:       typeof m['partialRuns']       === 'number' ? m['partialRuns']       : 0,
        failedRuns:        typeof m['failedRuns']        === 'number' ? m['failedRuns']        : 0,
        totalParsed:       typeof m['totalParsed']       === 'number' ? m['totalParsed']       : 0,
        totalValidated:    typeof m['totalValidated']    === 'number' ? m['totalValidated']    : 0,
        totalSaved:        typeof m['totalSaved']        === 'number' ? m['totalSaved']        : 0,
        totalRejected:     typeof m['totalRejected']     === 'number' ? m['totalRejected']     : 0,
        averageDurationMs: typeof m['averageDurationMs'] === 'number' ? m['averageDurationMs'] : 0,
        lastRunAt:         typeof m['lastRunAt']         === 'string' ? m['lastRunAt']         : null,
      }
    }
  }

  return {
    updatedAt:  typeof r['updatedAt'] === 'string' ? r['updatedAt'] : null,
    categories,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function readDiscoveryMetrics(): DiscoveryMetricsFile {
  try {
    const raw = storage.read(METRICS_FILE)
    if (raw === null) return defaultMetrics()
    return migrateMetrics(JSON.parse(raw))
  } catch {
    return defaultMetrics()
  }
}

export function saveDiscoveryMetrics(metrics: DiscoveryMetricsFile): void {
  try {
    const tmp = METRICS_FILE + '.tmp'
    storage.write(tmp, JSON.stringify(metrics, null, 2))
    storage.rename(tmp, METRICS_FILE)
  } catch {
    // best-effort
  }
}

export function updateDiscoveryMetrics(
  category: string,
  result: {
    status:     'success' | 'partial' | 'failed'
    durationMs: number
    parsed:     number
    validated:  number
    saved:      number
    rejected:   number
  },
): void {
  try {
    const metricsFile = readDiscoveryMetrics()
    const current     = metricsFile.categories[category] ?? defaultCategoryMetrics(category)

    // Increment run counters
    current.totalRuns++
    if (result.status === 'success') current.successfulRuns++
    else if (result.status === 'partial') current.partialRuns++
    else current.failedRuns++

    // Accumulate totals
    current.totalParsed    += result.parsed
    current.totalValidated += result.validated
    current.totalSaved     += result.saved
    current.totalRejected  += result.rejected

    // Welford's online mean: M_n = M_{n-1} + (x - M_{n-1}) / n
    current.averageDurationMs = current.averageDurationMs
      + (result.durationMs - current.averageDurationMs) / current.totalRuns

    current.lastRunAt = new Date().toISOString()
    metricsFile.categories[category] = current
    metricsFile.updatedAt = new Date().toISOString()

    saveDiscoveryMetrics(metricsFile)
  } catch {
    // best-effort
  }
}
