/**
 * lib/catalog/live-truth/reports.ts
 *
 * File-based persistence for the Live Truth system.
 *
 * Files:
 *   data/catalog/live-truth/results.json  — per-product results (all time)
 *   data/catalog/live-truth/report.json   — latest aggregated report
 *   data/catalog/live-truth/queue.json    — revalidation priority queue
 *
 * All reads are graceful (return empty defaults when files don't exist).
 * All writes are atomic (write to .tmp then rename).
 *
 * SERVER-ONLY: uses Node.js fs — never import from client components.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import { dataPath } from '@/lib/data-path'
import type {
  LiveTruthResult,
  TruthResultStore,
  TruthReport,
  ValidationQueue,
} from './types'

// ── Paths ─────────────────────────────────────────────────────────────────────

const DATA_DIR    = dataPath('data', 'catalog', 'live-truth')
const RESULTS_FILE = join(DATA_DIR, 'results.json')
const REPORT_FILE  = join(DATA_DIR, 'report.json')
const QUEUE_FILE   = join(DATA_DIR, 'queue.json')

function ensureDir(path: string): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function atomicWrite(path: string, data: unknown): void {
  ensureDir(path)
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, path)
}

function safeRead<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

// ── Results store ─────────────────────────────────────────────────────────────

const EMPTY_STORE: TruthResultStore = { updatedAt: '', results: {} }

export function loadResultStore(): TruthResultStore {
  return safeRead(RESULTS_FILE, EMPTY_STORE)
}

export function saveResult(result: LiveTruthResult): void {
  const store = loadResultStore()
  store.results[result.productId] = result
  store.updatedAt = new Date().toISOString()
  atomicWrite(RESULTS_FILE, store)
}

export function loadAllResults(): Record<string, LiveTruthResult> {
  return loadResultStore().results
}

/**
 * Returns the history (past results) for a single product.
 * Currently we only store the latest result per product, so history has at
 * most 1 entry. Callers should treat this as an ordered slice of recent checks.
 */
export function loadProductHistory(productId: string): LiveTruthResult[] {
  const store = loadResultStore()
  const latest = store.results[productId]
  return latest ? [latest] : []
}

// ── Report ────────────────────────────────────────────────────────────────────

export function buildReport(
  results:        Record<string, LiveTruthResult>,
  totalInCatalog: number,
): TruthReport {
  const list = Object.values(results)

  const validCount       = list.filter(r => r.status === 'valid').length
  const driftedCount     = list.filter(r => r.status === 'drifted').length
  const unavailableCount = list.filter(r => r.status === 'unavailable').length
  const suspectCount     = list.filter(r => r.status === 'suspect').length
  const failedCount      = list.filter(r => r.status === 'failed').length

  const fakeDiscountCount = list.filter(r => r.hasFakeDiscount).length
  const titleDriftCount   = list.filter(r => r.hasTitleDrift).length
  const imageDriftCount   = list.filter(r => r.hasImageDrift).length

  const scoredList = list.filter(r => r.confidence !== 'failed')
  const avgTruthScore = scoredList.length > 0
    ? Math.round(scoredList.reduce((s, r) => s + r.truthScore, 0) / scoredList.length)
    : 0

  const lowScoreCount = list.filter(r => r.truthScore < 40).length

  // Quarantine recommendations = products flagged by the quarantine engine
  // (stored in result.issues as a flag — we look for a specific marker)
  const quarantineRecommendations = list
    .filter(r => r.issues.some(i => i.startsWith('CUARENTENA')))
    .map(r => r.productId)

  return {
    generatedAt:    new Date().toISOString(),
    totalChecked:   list.length,
    totalInCatalog,
    validCount,
    driftedCount,
    unavailableCount,
    suspectCount,
    failedCount,
    fakeDiscountCount,
    titleDriftCount,
    imageDriftCount,
    avgTruthScore,
    lowScoreCount,
    quarantineRecommendations,
    results,
  }
}

export function saveReport(report: TruthReport): void {
  atomicWrite(REPORT_FILE, report)
}

export function loadReport(): TruthReport | null {
  return safeRead<TruthReport | null>(REPORT_FILE, null)
}

// ── Queue ─────────────────────────────────────────────────────────────────────

const EMPTY_QUEUE: ValidationQueue = { updatedAt: '', items: [] }

export function loadQueue(): ValidationQueue {
  return safeRead(QUEUE_FILE, EMPTY_QUEUE)
}

export function saveQueue(queue: ValidationQueue): void {
  atomicWrite(QUEUE_FILE, queue)
}
