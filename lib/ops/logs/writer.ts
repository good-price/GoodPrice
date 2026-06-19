/**
 * lib/ops/logs/writer.ts
 *
 * Persistent append-only log writer for GOODPRICE OPS V3.
 *
 * Storage layout (relative to dataPath base):
 *   data/ops/logs/index.json          — lightweight summary, max 90 days
 *   data/ops/logs/YYYY-MM-DD.json     — full entries for that day (Bogota tz)
 *
 * Guarantees:
 *   - Directories and files created automatically on first write.
 *   - Atomic writes via rename(tmp → target) — no partial JSON on disk.
 *   - Tolerant to corrupt or missing files: returns empty state.
 *   - Never throws a fatal exception — errors are silently swallowed.
 *   - All fs operations are synchronous (consistent with project pattern).
 *
 * SERVER-ONLY.
 */

import { join } from 'path'
import { storage } from '@/lib/storage/StorageFactory'
import { dataPath } from '@/lib/data-path'
import type { OpsLog, OpsLogDayFile, OpsLogIndex, OpsLogIndexEntry } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const LOGS_DIR    = dataPath('data', 'ops', 'logs')
const INDEX_FILE  = join(LOGS_DIR, 'index.json')
const MAX_INDEX_DAYS = 90

/** Colombia does not observe DST — fixed UTC-5 offset. */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000

// ── Helpers ───────────────────────────────────────────────────────────────────

function atomicWrite(filePath: string, content: string): void {
  const tmp = filePath + '.tmp'
  storage.write(tmp, content)
  storage.rename(tmp, filePath)
}

/** Returns the current date in America/Bogota as a YYYY-MM-DD string. */
function bogotaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  }).format(new Date())
}

// ── Day file I/O ──────────────────────────────────────────────────────────────

function dayFilePath(date: string): string {
  return join(LOGS_DIR, `${date}.json`)
}

function readDayFile(date: string): OpsLogDayFile {
  const path = dayFilePath(date)
  const raw = storage.read(path)
  if (raw === null) {
    return { date, updatedAt: new Date().toISOString(), logs: [] }
  }
  try {
    return JSON.parse(raw) as OpsLogDayFile
  } catch {
    return { date, updatedAt: new Date().toISOString(), logs: [] }
  }
}

function writeDayFile(file: OpsLogDayFile): void {
  file.updatedAt = new Date().toISOString()
  atomicWrite(dayFilePath(file.date), JSON.stringify(file, null, 2))
}

// ── Index I/O ─────────────────────────────────────────────────────────────────

function readIndex(): OpsLogIndex {
  const raw = storage.read(INDEX_FILE)
  if (raw === null) return []
  try {
    return JSON.parse(raw) as OpsLogIndex
  } catch {
    return []
  }
}

function writeIndex(index: OpsLogIndex): void {
  const sorted = index
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_INDEX_DAYS)
  atomicWrite(INDEX_FILE, JSON.stringify(sorted, null, 2))
}

/**
 * Ensures an index entry has all fields (handles entries written before
 * successfulRuns/partialRuns/cancelledRuns were added).
 * Uses `?? 0` so runtime-missing fields default to 0 while satisfying
 * the required-field type contract.
 */
function migrateIndexEntry(entry: OpsLogIndexEntry): OpsLogIndexEntry {
  return {
    ...entry,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    successfulRuns: entry.successfulRuns ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    partialRuns:    entry.partialRuns    ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    cancelledRuns:  entry.cancelledRuns  ?? 0,
  }
}

function upsertIndexEntry(date: string, log: OpsLog): void {
  const raw      = readIndex()
  const index    = raw.map(migrateIndexEntry)
  const existing = index.find(e => e.date === date)

  if (existing) {
    existing.totalRuns++
    if (log.status === 'failed')    existing.failedRuns++
    if (log.status === 'success')   existing.successfulRuns++
    if (log.status === 'partial')   existing.partialRuns++
    if (log.status === 'cancelled') existing.cancelledRuns++
    if (log.jobType === 'cycle-3am') {
      existing.cycleStatus     = log.status
      existing.cycleDurationMs = log.durationMs
      existing.lastCycleAt     = log.startedAt
    }
    existing.updatedAt = new Date().toISOString()
  } else {
    const entry: OpsLogIndexEntry = {
      date,
      totalRuns:       1,
      failedRuns:      log.status === 'failed'    ? 1 : 0,
      successfulRuns:  log.status === 'success'   ? 1 : 0,
      partialRuns:     log.status === 'partial'   ? 1 : 0,
      cancelledRuns:   log.status === 'cancelled' ? 1 : 0,
      cycleStatus:     log.jobType === 'cycle-3am' ? log.status    : null,
      cycleDurationMs: log.jobType === 'cycle-3am' ? log.durationMs : null,
      lastCycleAt:     log.jobType === 'cycle-3am' ? log.startedAt  : null,
      updatedAt:       new Date().toISOString(),
    }
    index.push(entry)
  }

  writeIndex(index)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Appends an OpsLog entry to today's day file and updates the index.
 * Never throws — all errors are silently caught.
 */
export function appendLog(log: OpsLog): void {
  try {
    const date    = bogotaToday()
    const dayFile = readDayFile(date)
    dayFile.logs.unshift(log)   // newest first
    writeDayFile(dayFile)
    upsertIndexEntry(date, log)
  } catch {
    // Intentionally swallowed — logging must never break callers.
  }
}

// ── Internal exports (used by reader.ts) ─────────────────────────────────────

export { readDayFile, readIndex, dayFilePath, bogotaToday, BOGOTA_OFFSET_MS }
