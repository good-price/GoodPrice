/**
 * lib/ops/execution/mutex.ts
 *
 * File-backed mutex to prevent duplicate / overlapping job execution.
 *
 * Lock lifetime is bounded: locks older than MAX_LOCK_AGE_MS are considered
 * stale and are automatically released. This handles crashed processes that
 * never had a chance to call releaseLock().
 *
 * SERVER-ONLY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { ExecJobType } from './types'
import { dataPath } from '@/lib/data-path'

// ── Config ────────────────────────────────────────────────────────────────────

const LOCK_PATH      = dataPath('data', 'ops', 'execution', 'locks.json')
/** Locks older than this are considered stale (process crashed). */
const MAX_LOCK_AGE_MS = 30 * 60 * 1_000   // 30 minutes

// ── Lock store ────────────────────────────────────────────────────────────────

interface LockEntry {
  jobId:     string
  acquiredAt: string   // ISO
}

type LockStore = Record<string, LockEntry>   // jobType → LockEntry

function ensureDir(): void {
  const dir = dirname(LOCK_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function readLocks(): LockStore {
  ensureDir()
  if (!existsSync(LOCK_PATH)) return {}
  try {
    return JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as LockStore
  } catch {
    return {}
  }
}

function writeLocks(store: LockStore): void {
  ensureDir()
  writeFileSync(LOCK_PATH, JSON.stringify(store, null, 2), 'utf8')
}

/** Remove any lock entries older than MAX_LOCK_AGE_MS. */
function purgeStaleLocks(store: LockStore): LockStore {
  const now = Date.now()
  const clean: LockStore = {}
  for (const [type, entry] of Object.entries(store)) {
    const age = now - new Date(entry.acquiredAt).getTime()
    if (age < MAX_LOCK_AGE_MS) {
      clean[type] = entry
    }
  }
  return clean
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attempt to acquire a lock for the given job type.
 * Returns true if the lock was acquired, false if it was already held.
 */
export function acquireLock(jobType: ExecJobType, jobId: string): boolean {
  const store = purgeStaleLocks(readLocks())
  if (store[jobType]) return false   // already locked
  store[jobType] = { jobId, acquiredAt: new Date().toISOString() }
  writeLocks(store)
  return true
}

/**
 * Release the lock for the given job type.
 * No-op if the lock is not held.
 */
export function releaseLock(jobType: ExecJobType): void {
  const purged = purgeStaleLocks(readLocks())
  delete purged[jobType]
  writeLocks(purged)
}

/**
 * Returns true if a lock is currently held for this job type
 * (and the lock is not stale).
 */
export function isLocked(jobType: ExecJobType): boolean {
  const store = purgeStaleLocks(readLocks())
  return !!store[jobType]
}

/**
 * Returns all currently held (non-stale) locks.
 */
export function getActiveLocks(): ExecJobType[] {
  const store = purgeStaleLocks(readLocks())
  return Object.keys(store) as ExecJobType[]
}

/**
 * Force-clear a lock (use after confirmed job completion or hard cancel).
 */
export function forceReleaseLock(jobType: ExecJobType): void {
  releaseLock(jobType)
}
