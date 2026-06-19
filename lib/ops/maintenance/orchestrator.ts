/**
 * lib/ops/maintenance/orchestrator.ts
 *
 * Maintenance window lifecycle management for GOODPRICE OPS V3.
 *
 * Provides the three public functions required by the automation engine:
 *   startMaintenance()     — opens a new session; idempotent on name collision
 *   finishMaintenance()    — closes the current session
 *   isMaintenanceRunning() — returns true when a session is open
 *
 * Scheduled maintenance (mode='scheduled') is initiated by the automation
 * runner before calling runMasterCycle(). Manual maintenance is initiated
 * by an operator via direct invocation.
 *
 * Neither function touches SiteMode — that remains the responsibility of
 * runMasterCycle() (scheduled) or the caller (manual).
 *
 * SERVER-ONLY.
 */

import { readMaintenanceState, writeMaintenanceState } from './state'
import type {
  MaintenanceSession,
  StartMaintenanceParams,
  FinishMaintenanceParams,
}                                                       from './types'

// ── ID generation ─────────────────────────────────────────────────────────────

function generateSessionId(): string {
  const ts   = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `maint-${ts}-${rand}`
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Opens a new maintenance session.
 *
 * If a session is already running, returns the existing session without
 * creating a duplicate (idempotent — safe to call even if the state file
 * is stale from a previous crash).
 *
 * Never throws.
 */
export function startMaintenance(params: StartMaintenanceParams): MaintenanceSession {
  try {
    const state = readMaintenanceState()

    // If already running, return the current session rather than creating a duplicate
    if (state.current?.status === 'running') {
      return state.current
    }

    const session: MaintenanceSession = {
      id:             generateSessionId(),
      mode:           params.mode,
      reason:         params.reason,
      startedAt:      new Date().toISOString(),
      estimatedEndAt: params.estimatedEndAt ?? null,
      completedAt:    null,
      pipelineId:     params.pipelineId ?? null,
      status:         'running',
    }

    writeMaintenanceState({ current: session, lastSession: state.lastSession })
    return session
  } catch {
    // Fallback — return a synthetic session so callers always get a value
    return {
      id:             generateSessionId(),
      mode:           params.mode,
      reason:         params.reason,
      startedAt:      new Date().toISOString(),
      estimatedEndAt: params.estimatedEndAt ?? null,
      completedAt:    null,
      pipelineId:     params.pipelineId ?? null,
      status:         'running',
    }
  }
}

/**
 * Closes the current maintenance session.
 *
 * Updates `pipelineId` if provided (allows the automation runner to link
 * the session to the cycle's pipelineId after the cycle completes).
 *
 * Returns the closed session, or null if no session was running.
 * Never throws.
 */
export function finishMaintenance(params: FinishMaintenanceParams): MaintenanceSession | null {
  try {
    const state = readMaintenanceState()
    if (!state.current) return null

    const completedAt = params.completedAt ?? new Date().toISOString()

    const closed: MaintenanceSession = {
      ...state.current,
      status:      params.status,
      completedAt,
      pipelineId:  params.pipelineId !== undefined ? (params.pipelineId ?? null) : state.current.pipelineId,
    }

    writeMaintenanceState({ current: null, lastSession: closed })
    return closed
  } catch {
    return null
  }
}

/**
 * Returns true if a maintenance session is currently open (status='running').
 * Never throws.
 */
export function isMaintenanceRunning(): boolean {
  try {
    const state = readMaintenanceState()
    return state.current?.status === 'running'
  } catch {
    return false
  }
}

/**
 * Returns the current maintenance session, or null if none is running.
 * Never throws.
 */
export function getCurrentSession(): MaintenanceSession | null {
  try {
    const state = readMaintenanceState()
    return state.current?.status === 'running' ? state.current : null
  } catch {
    return null
  }
}

/**
 * Returns the last completed maintenance session, or null if none exists.
 * Never throws.
 */
export function getLastSession(): MaintenanceSession | null {
  try {
    const state = readMaintenanceState()
    return state.lastSession ?? null
  } catch {
    return null
  }
}
