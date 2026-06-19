/**
 * lib/catalog/lifecycle/metrics.ts
 *
 * Lifecycle scan run tracking — Sprint 4D.
 *
 * Tracks when lifecycle scans ran, how long they took, and the health
 * breakdown of the last scan. Used by the OPS log integration and the
 * admin UI.
 *
 * Persists to data/catalog/lifecycle-metrics.json.
 * Atomic writes. Fault-tolerant reads.
 * SERVER-ONLY.
 */

import path from 'path'
import { storage } from '@/lib/storage/StorageFactory'
import type { LifecycleMetricsFile } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const METRICS_FILE = path.resolve(process.cwd(), 'data/catalog/lifecycle-metrics.json')

// ── Defaults ──────────────────────────────────────────────────────────────────

function defaultMetrics(): LifecycleMetricsFile {
  return {
    lastScanAt:          null,
    totalScans:          0,
    lastScanDurationMs:  0,
    lastScanUpdated:     0,
    lastHealthBreakdown: null,
  }
}

// ── Migration ─────────────────────────────────────────────────────────────────

function migrateMetrics(raw: unknown): LifecycleMetricsFile {
  if (!raw || typeof raw !== 'object') return defaultMetrics()
  const r = raw as Record<string, unknown>

  return {
    lastScanAt:         typeof r['lastScanAt']         === 'string' ? r['lastScanAt']         : null,
    totalScans:         typeof r['totalScans']         === 'number' ? r['totalScans']         : 0,
    lastScanDurationMs: typeof r['lastScanDurationMs'] === 'number' ? r['lastScanDurationMs'] : 0,
    lastScanUpdated:    typeof r['lastScanUpdated']    === 'number' ? r['lastScanUpdated']    : 0,
    lastHealthBreakdown: (
      r['lastHealthBreakdown'] && typeof r['lastHealthBreakdown'] === 'object'
        ? r['lastHealthBreakdown'] as LifecycleMetricsFile['lastHealthBreakdown']
        : null
    ),
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function readLifecycleMetrics(): LifecycleMetricsFile {
  const raw = storage.read(METRICS_FILE)
  if (raw === null) return defaultMetrics()
  try {
    return migrateMetrics(JSON.parse(raw))
  } catch {
    return defaultMetrics()
  }
}

export function saveLifecycleMetrics(metrics: LifecycleMetricsFile): void {
  try {
    const tmp = METRICS_FILE + '.tmp'
    storage.write(tmp, JSON.stringify(metrics, null, 2))
    storage.rename(tmp, METRICS_FILE)
  } catch {
    // best-effort
  }
}

/**
 * Records the result of a lifecycle scan run.
 */
export function updateLifecycleMetrics(data: {
  durationMs:  number
  updated:     number
  breakdown:   { healthy: number; aging: number; stale: number; critical: number }
}): void {
  try {
    const current = readLifecycleMetrics()
    const next: LifecycleMetricsFile = {
      lastScanAt:          new Date().toISOString(),
      totalScans:          current.totalScans + 1,
      lastScanDurationMs:  data.durationMs,
      lastScanUpdated:     data.updated,
      lastHealthBreakdown: data.breakdown,
    }
    saveLifecycleMetrics(next)
  } catch {
    // best-effort
  }
}
