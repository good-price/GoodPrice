/**
 * lib/ops/maintenance/types.ts
 *
 * Types for the GOODPRICE OPS V3 Maintenance Orchestrator.
 *
 * A MaintenanceSession tracks a window of elevated-privilege operations
 * during which the site is in 'scheduled_maintenance' or 'maintenance' mode.
 *
 * Two modes:
 *   scheduled — triggered automatically by the cycle-3am automation
 *   manual    — triggered by an operator via startMaintenance()
 *
 * SERVER-ONLY.
 */

// ── Session ───────────────────────────────────────────────────────────────────

export interface MaintenanceSession {
  /** Unique identifier for this session (maint-{ts36}-{rand}). */
  id: string

  /** How this session was initiated. */
  mode: 'scheduled' | 'manual'

  /** Human-readable reason for the maintenance window. */
  reason: string

  /** ISO timestamp when the session started. */
  startedAt: string

  /** ISO timestamp estimating when the session will end. null if unknown. */
  estimatedEndAt: string | null

  /** ISO timestamp when the session was closed. null while running. */
  completedAt: string | null

  /** pipelineId of the Master Cycle that ran during this session. null for manual. */
  pipelineId: string | null

  /** Current lifecycle state. */
  status: 'running' | 'completed' | 'failed'
}

// ── State file ────────────────────────────────────────────────────────────────

export interface MaintenanceStateFile {
  /**
   * Active session. null when no maintenance window is open.
   * Written on startMaintenance(), cleared on finishMaintenance().
   */
  current: MaintenanceSession | null

  /**
   * Most recently completed session.
   * Preserved after finishMaintenance() for auditing.
   */
  lastSession: MaintenanceSession | null
}

// ── Parameters ────────────────────────────────────────────────────────────────

export interface StartMaintenanceParams {
  mode:           'scheduled' | 'manual'
  reason:         string
  estimatedEndAt: string | null
  pipelineId?:    string | null
}

export interface FinishMaintenanceParams {
  status:      'completed' | 'failed'
  pipelineId?: string | null
  completedAt?: string
}
