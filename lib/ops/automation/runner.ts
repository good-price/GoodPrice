/**
 * lib/ops/automation/runner.ts
 *
 * Automation execution engine for GOODPRICE OPS V3.
 *
 * runAutomation(id):
 *   1. Looks up the automation definition in the registry.
 *   2. Validates it is enabled and has a registered worker (or is cycle-3am).
 *   3. For cycle-3am: opens a MaintenanceSession, calls runMasterCycle(),
 *      closes the session, and links the pipelineId.
 *   4. For individual job automations: calls the worker directly.
 *   5. Updates automation-state.json with lastRunAt, nextRunAt, averageDurationMs.
 *
 * computeNextRunAt(def, fromDate?):
 *   Computes when the automation should next run based on its schedule.
 *   Returns null for on-demand-only automations (no intervalMs, no scheduledHour).
 *
 * SERVER-ONLY.
 */

import { storage }                   from '@/lib/storage/StorageFactory'
import { dataPath }                 from '@/lib/data-path'
import { runMasterCycle }           from '../cycle/runner'
import { getWorker }                from '../workers/registry'
import { runWithTimeout }           from '../workers/executor'
import { startMaintenance, finishMaintenance } from '../maintenance/orchestrator'
import { getNextOccurrenceAtHour }  from '../time/timezone'
import { getAutomation }            from './registry'
import type { AutomationDefinition, AutomationRunResult, AutomationRunState, AutomationStateFile } from './types'
import type { OpsJobType, OpsLogStatus }        from '../logs/types'

// ── Automation state file ─────────────────────────────────────────────────────

const AUTO_STATE_FILE = dataPath('data', 'ops', 'runtime', 'automation-state.json')

function atomicWriteJSON(filePath: string, data: unknown): void {
  const tmp = filePath + '.tmp'
  storage.write(tmp, JSON.stringify(data, null, 2))
  storage.rename(tmp, filePath)
}

function readAutoStateFile(): AutomationStateFile {
  const raw = storage.read(AUTO_STATE_FILE)
  if (raw === null) return { updatedAt: new Date().toISOString(), automations: {} }
  try {
    return JSON.parse(raw) as AutomationStateFile
  } catch {
    return { updatedAt: new Date().toISOString(), automations: {} }
  }
}

// ── Next-run computation ──────────────────────────────────────────────────────

/**
 * Computes the next scheduled run time for an automation.
 *
 * For scheduledHour automations: delegates to getNextOccurrenceAtHour() which
 * uses a timezone-correct noon-UTC anchor algorithm — no manual offset math.
 *
 * For intervalMs automations: fromDate.getTime() + intervalMs (as ISO string).
 *
 * For on-demand automations (no scheduledHour, no intervalMs): returns null.
 */
export function computeNextRunAt(def: AutomationDefinition, fromDate: Date = new Date()): string | null {
  if (def.scheduledHour !== undefined && def.timezone) {
    return getNextOccurrenceAtHour(def.scheduledHour, def.timezone, fromDate).toISOString()
  }

  if (def.intervalMs !== null) {
    return new Date(fromDate.getTime() + def.intervalMs).toISOString()
  }

  return null
}

// ── Automation state update ───────────────────────────────────────────────────

function updateAutomationState(
  id:         string,
  status:     OpsLogStatus,
  durationMs: number,
  def:        AutomationDefinition,
): void {
  try {
    const file = readAutoStateFile()
    const prev = file.automations[id]

    const prevTotal = prev?.totalRuns         ?? 0
    const prevAvg   = prev?.averageDurationMs ?? 0
    const newTotal  = prevTotal + 1
    const newAvg    = prevAvg + (durationMs - prevAvg) / newTotal  // Welford's mean

    const now        = new Date().toISOString()
    const nextRunAt  = computeNextRunAt(def, new Date())

    const next: AutomationRunState = {
      id,
      lastRunAt:         now,
      nextRunAt,
      averageDurationMs: Math.round(newAvg),
      lastStatus:        status,
      totalRuns:         newTotal,
    }

    const updated: AutomationStateFile = {
      updatedAt:   now,
      automations: { ...file.automations, [id]: next },
    }
    atomicWriteJSON(AUTO_STATE_FILE, updated)
  } catch {
    // Intentionally swallowed — metrics are best-effort
  }
}

// ── Individual job runner ─────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000   // 5 min

async function runJobAutomation(
  def:        AutomationDefinition,
  startedAt:  string,
  startMs:    number,
): Promise<AutomationRunResult> {
  const worker = getWorker(def.jobType as OpsJobType)

  if (!worker) {
    const completedAt = new Date().toISOString()
    const durationMs  = Date.now() - startMs
    const errMsg      = `No registered worker for job type: ${def.jobType}`
    return {
      id:          def.id,
      jobType:     def.jobType,
      status:      'failed',
      startedAt,
      completedAt,
      durationMs,
      errors:      [errMsg],
      summary:     `Automation '${def.id}' failed: ${errMsg}`,
    }
  }

  const outcome = await runWithTimeout(
    () => worker({ pipelineId: def.id, timeoutMs: DEFAULT_TIMEOUT_MS }),
    DEFAULT_TIMEOUT_MS,
  )

  const completedAt = new Date().toISOString()
  const durationMs  = Date.now() - startMs

  if (outcome.ok) {
    const r       = outcome.value
    const status: OpsLogStatus = r.success ? 'success' : 'failed'
    return {
      id:          def.id,
      jobType:     def.jobType,
      status,
      startedAt,
      completedAt,
      durationMs,
      errors:      r.errors,
      summary:     r.summary,
    }
  } else {
    return {
      id:          def.id,
      jobType:     def.jobType,
      status:      'failed',
      startedAt,
      completedAt,
      durationMs,
      errors:      [outcome.error],
      summary:     `Automation '${def.id}': ${outcome.timedOut ? 'timed out' : 'failed'} — ${outcome.error}`,
    }
  }
}

// ── Cycle-3AM runner ──────────────────────────────────────────────────────────

async function runCycleAutomation(
  def:       AutomationDefinition,
  startedAt: string,
  startMs:   number,
): Promise<AutomationRunResult> {
  const estimatedEnd = new Date(startMs + 30 * 60 * 1000).toISOString()

  // ── Open maintenance session ────────────────────────────────────────────────
  startMaintenance({
    mode:           'scheduled',
    reason:         'Ciclo automatizado 3AM — mantenimiento programado nocturno',
    estimatedEndAt: estimatedEnd,
  })

  // ── Execute master cycle ────────────────────────────────────────────────────
  // runMasterCycle() internally manages SiteMode (scheduled_maintenance → public)
  // and the cycle lock. The maintenance session adds orchestration-level tracking.
  const cycleResult = await runMasterCycle()

  const completedAt = new Date().toISOString()
  const durationMs  = Date.now() - startMs

  // ── Close maintenance session with cycle's pipelineId ──────────────────────
  const maintenanceStatus: 'completed' | 'failed' =
    cycleResult.status === 'failed' ? 'failed' : 'completed'

  finishMaintenance({
    status:      maintenanceStatus,
    pipelineId:  cycleResult.pipelineId,
    completedAt,
  })

  return {
    id:          def.id,
    jobType:     def.jobType,
    status:      cycleResult.status,
    startedAt,
    completedAt,
    durationMs,
    errors:      cycleResult.errors,
    summary:     cycleResult.summary,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs a registered automation by id.
 *
 * Returns an AutomationRunResult and persists the run to automation-state.json.
 * Never throws — all errors are returned as status='failed'.
 */
export async function runAutomation(id: string): Promise<AutomationRunResult> {
  const startedAt = new Date().toISOString()
  const startMs   = Date.now()

  const def = getAutomation(id)

  if (!def) {
    const completedAt = new Date().toISOString()
    return {
      id,
      jobType:     'manual-action' as AutomationDefinition['jobType'],
      status:      'failed',
      startedAt,
      completedAt,
      durationMs:  0,
      errors:      [`Automation '${id}' not found in registry`],
      summary:     `Automation '${id}' not found`,
    }
  }

  if (!def.enabled) {
    const completedAt = new Date().toISOString()
    return {
      id,
      jobType:     def.jobType,
      status:      'cancelled',
      startedAt,
      completedAt,
      durationMs:  0,
      errors:      [],
      summary:     `Automation '${id}' is disabled — skipped`,
    }
  }

  let result: AutomationRunResult

  try {
    if (def.jobType === 'cycle-3am') {
      result = await runCycleAutomation(def, startedAt, startMs)
    } else {
      result = await runJobAutomation(def, startedAt, startMs)
    }
  } catch (err) {
    const completedAt = new Date().toISOString()
    const errMsg      = err instanceof Error ? err.message : String(err)
    result = {
      id,
      jobType:     def.jobType,
      status:      'failed',
      startedAt,
      completedAt,
      durationMs:  Date.now() - startMs,
      errors:      [errMsg],
      summary:     `Automation '${id}' threw unexpected exception: ${errMsg}`,
    }
  }

  updateAutomationState(id, result.status, result.durationMs, def)
  return result
}

/**
 * Reads the current automation state file.
 * Returns empty state on missing or corrupt file.
 * Never throws.
 */
export function readAutomationState(): AutomationStateFile {
  return readAutoStateFile()
}
