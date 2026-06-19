/**
 * lib/ops/cycle/lock.ts
 *
 * Persistent cycle-lock mechanism for GOODPRICE OPS V3.
 *
 * Prevents concurrent Master Cycle executions by maintaining a lock file
 * at data/ops/runtime/cycle-lock.json. Designed for single-process use
 * (Vercel serverless functions are single-threaded per invocation, and
 * the 3AM cron is the sole trigger). The lock is advisory — it is the
 * caller's responsibility to check before running.
 *
 * Guarantees:
 *   - Atomic writes via rename(tmp → target) — no partial JSON on disk.
 *   - Tolerant to missing or corrupt lock files: isCycleLocked() returns
 *     { locked: false } on any read failure.
 *   - acquireCycleLock() returns false (does NOT throw) if already locked.
 *   - All fs operations are synchronous (consistent with project pattern).
 *
 * NOT integrated with runMasterCycle() yet — Sprint 1A.1 infrastructure only.
 *
 * SERVER-ONLY.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { dirname } from 'path'
import { dataPath } from '@/lib/data-path'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CycleLockState {
  locked:     boolean
  pipelineId: string | null
  lockedAt:   string | null   // ISO — when lock was acquired
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCK_FILE = dataPath('data', 'ops', 'runtime', 'cycle-lock.json')

// ── Internal helpers ──────────────────────────────────────────────────────────

function ensureLockDir(): void {
  const dir = dirname(LOCK_FILE)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function atomicWrite(content: string): void {
  ensureLockDir()
  const tmp = LOCK_FILE + '.tmp'
  writeFileSync(tmp, content, 'utf-8')
  renameSync(tmp, LOCK_FILE)
}

function readLockFile(): CycleLockState {
  if (!existsSync(LOCK_FILE)) return { locked: false, pipelineId: null, lockedAt: null }
  try {
    const data = JSON.parse(readFileSync(LOCK_FILE, 'utf-8')) as Record<string, unknown>
    return {
      locked:     data.locked === true,
      pipelineId: typeof data.pipelineId === 'string' ? data.pipelineId : null,
      lockedAt:   typeof data.lockedAt   === 'string' ? data.lockedAt   : null,
    }
  } catch {
    return { locked: false, pipelineId: null, lockedAt: null }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attempts to acquire the cycle lock for the given pipelineId.
 *
 * Returns `true` if the lock was successfully acquired.
 * Returns `false` if the lock is already held — caller must NOT proceed.
 *
 * Never throws.
 */
export function acquireCycleLock(pipelineId: string): boolean {
  try {
    const current = readLockFile()
    if (current.locked) return false

    const state: CycleLockState = {
      locked:     true,
      pipelineId,
      lockedAt:   new Date().toISOString(),
    }
    atomicWrite(JSON.stringify(state, null, 2))
    return true
  } catch {
    return false
  }
}

/**
 * Releases the cycle lock unconditionally.
 * Safe to call even if no lock is held.
 * Never throws.
 */
export function releaseCycleLock(): void {
  try {
    if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE)
  } catch {
    // If deletion fails, write an unlocked state as fallback.
    try {
      const state: CycleLockState = { locked: false, pipelineId: null, lockedAt: null }
      atomicWrite(JSON.stringify(state, null, 2))
    } catch {
      // Intentionally swallowed.
    }
  }
}

/**
 * Returns the current lock state.
 * Returns `{ locked: false, ... }` on any read failure.
 * Never throws.
 */
export function isCycleLocked(): CycleLockState {
  return readLockFile()
}
