/**
 * lib/catalog/repair/history.ts
 *
 * Reads and writes the repair history files:
 *   data/catalog-history/replacements.json  — successful repairs
 *   data/catalog-history/failures.json      — failed repair attempts
 *
 * Both files are append-only JSON. The most recent entry is last.
 * Max entries per file: 500 (older ones are trimmed to avoid unbounded growth).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { ReplacementEntry, FailureEntry, HistoryFile } from './types'

// ── Paths ──────────────────────────────────────────────────────────────────────

const HISTORY_DIR        = join(process.cwd(), 'data', 'catalog-history')
const REPLACEMENTS_PATH  = join(HISTORY_DIR, 'replacements.json')
const FAILURES_PATH      = join(HISTORY_DIR, 'failures.json')
const MAX_ENTRIES        = 500

// ── Internal I/O ──────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(HISTORY_DIR)) {
    mkdirSync(HISTORY_DIR, { recursive: true })
  }
}

function readFile<T>(path: string): HistoryFile<T> {
  if (!existsSync(path)) return { version: 1, entries: [] }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as HistoryFile<T>
  } catch {
    return { version: 1, entries: [] }
  }
}

function writeFile<T>(path: string, data: HistoryFile<T>): void {
  ensureDir()
  // Trim to MAX_ENTRIES (keep most recent)
  if (data.entries.length > MAX_ENTRIES) {
    data.entries = data.entries.slice(-MAX_ENTRIES)
  }
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function recordReplacement(entry: ReplacementEntry): void {
  const file = readFile<ReplacementEntry>(REPLACEMENTS_PATH)
  file.entries.push(entry)
  writeFile(REPLACEMENTS_PATH, file)
}

export function recordFailure(entry: FailureEntry): void {
  const file = readFile<FailureEntry>(FAILURES_PATH)
  // Replace existing entry for same productId (update rather than accumulate)
  file.entries = file.entries.filter(e => e.productId !== entry.productId)
  file.entries.push(entry)
  writeFile(FAILURES_PATH, file)
}

export function getReplacementHistory(): ReplacementEntry[] {
  return readFile<ReplacementEntry>(REPLACEMENTS_PATH).entries
}

export function getFailures(): FailureEntry[] {
  return readFile<FailureEntry>(FAILURES_PATH).entries
}

/** Removes a product from the failures list (e.g. after successful repair) */
export function clearFailure(productId: string): void {
  const file = readFile<FailureEntry>(FAILURES_PATH)
  file.entries = file.entries.filter(e => e.productId !== productId)
  writeFile(FAILURES_PATH, file)
}

/** Returns summary counts for the repair report */
export function getHistorySummary(): {
  totalReplacements: number
  pendingManualReview: number
  openFailures: number
} {
  const replacements = getReplacementHistory()
  const failures     = getFailures()
  return {
    totalReplacements:  replacements.filter(r => r.status === 'auto_replaced').length,
    pendingManualReview: replacements.filter(r => r.status === 'manual_review_required').length,
    openFailures:       failures.length,
  }
}
