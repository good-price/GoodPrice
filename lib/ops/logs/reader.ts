/**
 * lib/ops/logs/reader.ts
 *
 * Read layer for the GOODPRICE OPS V3 persistent log engine.
 *
 * All reads are synchronous and fault-tolerant:
 *   - Missing files return empty results.
 *   - Corrupt files return empty results.
 *   - Never throws.
 *
 * SERVER-ONLY.
 */

import { storage } from '@/lib/storage/StorageFactory'
import type { OpsLog, OpsLogIndex, OpsLogIndexEntry } from './types'
import type { OpsJobType } from './types'
import { readDayFile, readIndex, dayFilePath, bogotaToday } from './writer'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns all log entries for a specific date (YYYY-MM-DD, Bogota timezone).
 * Returns empty array if no file exists or file is corrupt.
 */
export function readLogsByDate(date: string): OpsLog[] {
  try {
    return readDayFile(date).logs
  } catch {
    return []
  }
}

/**
 * Returns the most recent log entries across day files.
 *
 * Scans day files from newest to oldest (as recorded in the index) until
 * `limit` entries are collected or the last 30 days are exhausted.
 * Within each day file, entries are sorted by startedAt descending before
 * collecting — this normalises any out-of-order appends.
 *
 * Clamping: limit is clamped to [1, 1000].
 * Fault tolerance: missing or corrupt day files are silently skipped.
 */
export function readLatestLogs(limit = 50): OpsLog[] {
  try {
    const effectiveLimit = Math.min(Math.max(Math.floor(limit), 1), 1000)

    const index  = readIndex()
    const sorted = index.slice().sort((a, b) => b.date.localeCompare(a.date))

    // Always start with today even if not yet in the index
    const today      = bogotaToday()
    const datesToTry = [today, ...sorted.map(e => e.date).filter(d => d !== today)]
      .slice(0, 30)

    const collected: OpsLog[] = []

    for (const date of datesToTry) {
      if (collected.length >= effectiveLimit) break
      if (!storage.exists(dayFilePath(date))) continue

      let dayLogs: OpsLog[]
      try {
        dayLogs = readDayFile(date).logs
      } catch {
        continue   // corrupt day file — skip silently
      }

      if (dayLogs.length === 0) continue

      const sorted = dayLogs
        .slice()
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))

      const needed = effectiveLimit - collected.length
      collected.push(...sorted.slice(0, needed))
    }

    return collected
  } catch {
    return []
  }
}

/**
 * Returns the index (summary of the last 90 days, newest first).
 * Empty array if no index exists yet.
 */
export function readLogsSummary(): OpsLogIndex {
  try {
    return readIndex()
  } catch {
    return []
  }
}

/**
 * Returns the most recent OpsLog entry for a given job type,
 * scanning up to `maxDays` day files (newest first).
 * Returns null if no entry is found.
 */
export function getLastLogByJobType(
  jobType: OpsJobType,
  maxDays = 7,
): OpsLog | null {
  try {
    const index  = readIndex()
    const sorted = index.slice().sort((a, b) => b.date.localeCompare(a.date))
    const today  = bogotaToday()

    const datesToTry = [today, ...sorted.map(e => e.date).filter(d => d !== today)]
      .slice(0, maxDays)

    for (const date of datesToTry) {
      if (!storage.exists(dayFilePath(date))) continue
      const entry = readDayFile(date).logs.find(l => l.jobType === jobType)
      if (entry) return entry
    }

    return null
  } catch {
    return null
  }
}

/**
 * Returns the most recent index entry for a given date.
 * Returns null if no index entry exists for that date.
 */
export function getIndexEntryByDate(date: string): OpsLogIndexEntry | null {
  try {
    return readIndex().find(e => e.date === date) ?? null
  } catch {
    return null
  }
}

/**
 * Returns the most recent index entry that has a cycle run recorded.
 * Useful for the Dashboard "last cycle" widget.
 */
export function getLastCycleIndexEntry(): OpsLogIndexEntry | null {
  try {
    const index = readIndex()
    return (
      index
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .find(e => e.cycleStatus !== null) ?? null
    )
  } catch {
    return null
  }
}
