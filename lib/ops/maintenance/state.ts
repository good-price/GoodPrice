/**
 * lib/ops/maintenance/state.ts
 *
 * Atomic, fault-tolerant persistence for maintenance session state.
 *
 * Persists to: data/ops/runtime/maintenance-state.json
 *
 * All writes:
 *   - Atomic: writeFileSync(tmp) + renameSync(tmp → target)
 *   - Never throw
 *   - Directory auto-created if missing
 *   - All fs operations synchronous
 *
 * All reads:
 *   - Return null state on missing or corrupt file
 *   - Never throw
 *   - Migration-tolerant
 *
 * SERVER-ONLY.
 */

import { storage }               from '@/lib/storage/StorageFactory'
import { dataPath }              from '@/lib/data-path'
import type {
  MaintenanceSession,
  MaintenanceStateFile,
}                                from './types'

// ── File path ─────────────────────────────────────────────────────────────────

const STATE_FILE = dataPath('data', 'ops', 'runtime', 'maintenance-state.json')

// ── Internal helpers ──────────────────────────────────────────────────────────

function atomicWrite(data: MaintenanceStateFile): void {
  const tmp = STATE_FILE + '.tmp'
  storage.write(tmp, JSON.stringify(data, null, 2))
  storage.rename(tmp, STATE_FILE)
}

function migrateSession(raw: Record<string, unknown>): MaintenanceSession {
  return {
    id:             typeof raw.id             === 'string' ? raw.id             : 'unknown',
    mode:           raw.mode === 'scheduled' || raw.mode === 'manual' ? raw.mode : 'manual',
    reason:         typeof raw.reason         === 'string' ? raw.reason         : '',
    startedAt:      typeof raw.startedAt      === 'string' ? raw.startedAt      : new Date().toISOString(),
    estimatedEndAt: typeof raw.estimatedEndAt === 'string' ? raw.estimatedEndAt : null,
    completedAt:    typeof raw.completedAt    === 'string' ? raw.completedAt    : null,
    pipelineId:     typeof raw.pipelineId     === 'string' ? raw.pipelineId     : null,
    status:         raw.status === 'running' || raw.status === 'completed' || raw.status === 'failed'
      ? raw.status
      : 'failed',
  }
}

function empty(): MaintenanceStateFile {
  return { current: null, lastSession: null }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reads maintenance-state.json.
 * Returns { current: null, lastSession: null } on missing or corrupt file.
 * Never throws.
 */
export function readMaintenanceState(): MaintenanceStateFile {
  const rawStr = storage.read(STATE_FILE)
  if (rawStr === null) return empty()
  try {
    const raw = JSON.parse(rawStr) as Record<string, unknown>
    const current = (typeof raw.current === 'object' && raw.current !== null)
      ? migrateSession(raw.current as Record<string, unknown>)
      : null
    const lastSession = (typeof raw.lastSession === 'object' && raw.lastSession !== null)
      ? migrateSession(raw.lastSession as Record<string, unknown>)
      : null
    return { current, lastSession }
  } catch {
    return empty()
  }
}

/**
 * Persists a new state file atomically.
 * Never throws.
 */
export function writeMaintenanceState(state: MaintenanceStateFile): void {
  try {
    atomicWrite(state)
  } catch {
    // Intentionally swallowed
  }
}
