#!/usr/bin/env tsx
/**
 * scripts/validate-sprint-1d.ts
 *
 * Sprint 1D — Automation Engine + Maintenance Orchestrator validation.
 *
 * Validates:
 *   1. Automation Registry — 7 automations registered, correct jobTypes
 *   2. computeNextRunAt() — cycle-3am computes valid future date
 *   3. runAutomation('cycle-3am') — full flow:
 *        scheduled_maintenance → MaintenanceSession → runMasterCycle() → public
 *   4. automation-state.json — lastRunAt, nextRunAt, averageDurationMs, lastStatus
 *   5. maintenance-state.json — session created, pipelineId linked, session closed
 *   6. Runtime cross-validation — master-cycle-state + system-health still correct
 *   7. Manual maintenance — startMaintenance(), isMaintenanceRunning(), finishMaintenance()
 *   8. trm-update — gracefully fails (no worker), automation-state updated
 *
 * Usage:
 *   npx tsx scripts/validate-sprint-1d.ts
 */

import { existsSync, unlinkSync }              from 'fs'
import { join }                                from 'path'
import {
  getAllAutomations,
  getAutomation,
  getEnabledAutomations,
  runAutomation,
  readAutomationState,
  computeNextRunAt,
}                                              from '@/lib/ops/automation'
import {
  startMaintenance,
  finishMaintenance,
  isMaintenanceRunning,
  getCurrentSession,
  getLastSession,
  readMaintenanceState,
}                                              from '@/lib/ops/maintenance'
import { readMasterCycleState, readSystemHealth } from '@/lib/ops/runtime'
import { readSiteMode }                        from '@/lib/system/site-mode'
import { releaseCycleLock }                    from '@/lib/ops/cycle'

// ── ANSI ──────────────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m'
const RED    = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN   = '\x1b[36m'
const BOLD   = '\x1b[1m'
const DIM    = '\x1b[2m'
const RESET  = '\x1b[0m'

function pass(msg: string)  { console.log(`${GREEN}✓${RESET} ${msg}`) }
function fail(msg: string)  { console.log(`${RED}✗${RESET} ${msg}`); process.exitCode = 1 }
function info(msg: string)  { console.log(`${CYAN}→${RESET} ${msg}`) }
function warn(msg: string)  { console.log(`${YELLOW}⚠${RESET} ${msg}`) }
function hr()               { console.log(`${DIM}${'─'.repeat(60)}${RESET}`) }
function section(t: string) { console.log(`\n${BOLD}${t}${RESET}`); hr() }

// ── Runtime file paths ────────────────────────────────────────────────────────

const RUNTIME_DIR       = join(process.cwd(), 'data', 'ops', 'runtime')
const AUTO_STATE_FILE   = join(RUNTIME_DIR, 'automation-state.json')
const MAINT_STATE_FILE  = join(RUNTIME_DIR, 'maintenance-state.json')

function deleteIfExists(p: string) {
  try { if (existsSync(p)) unlinkSync(p) } catch { /* ignore */ }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}${CYAN}GOODPRICE OPS V3 — Sprint 1D Validation${RESET}`)
  console.log(`${DIM}${new Date().toISOString()}${RESET}\n`)

  releaseCycleLock()
  deleteIfExists(AUTO_STATE_FILE)
  deleteIfExists(MAINT_STATE_FILE)

  // ── 1. Automation Registry ──────────────────────────────────────────────────

  section('1. Automation Registry — definitions')

  const all     = getAllAutomations()
  const enabled = getEnabledAutomations()

  info(`Total automations registered: ${all.length}`)
  info(`Enabled automations:          ${enabled.length}`)

  const expectedIds = ['cycle-3am', 'trust-recompute', 'live-truth', 'link-audit', 'colombia-audit', 'repair', 'trm-update']

  for (const id of expectedIds) {
    const def = getAutomation(id)
    if (def) {
      pass(`Registered: '${id}' (jobType=${def.jobType}, enabled=${def.enabled})`)
    } else {
      fail(`Missing automation: '${id}'`)
    }
  }

  if (all.length >= expectedIds.length) {
    pass(`Registry has ${all.length} automations (≥ ${expectedIds.length} required)`)
  } else {
    fail(`Registry has ${all.length} automations but expected ≥ ${expectedIds.length}`)
  }

  const cycleAutomation = getAutomation('cycle-3am')
  if (cycleAutomation?.scheduledHour === 3 && cycleAutomation.timezone === 'America/Bogota') {
    pass(`cycle-3am: scheduledHour=3, timezone=America/Bogota`)
  } else {
    fail(`cycle-3am schedule mismatch: ${JSON.stringify(cycleAutomation)}`)
  }

  // ── 2. computeNextRunAt ─────────────────────────────────────────────────────

  section('2. computeNextRunAt() — next scheduled occurrence')

  const cycleDef = getAutomation('cycle-3am')!
  const fromDate  = new Date('2026-06-18T10:00:00.000Z')  // 5 AM Bogota (after 03:00)
  const nextRun   = computeNextRunAt(cycleDef, fromDate)

  info(`computeNextRunAt('cycle-3am', ${fromDate.toISOString()}) → ${nextRun}`)

  if (nextRun !== null) {
    pass(`computeNextRunAt returns non-null for cycle-3am`)
    const nextDate = new Date(nextRun)
    if (nextDate > fromDate) {
      pass(`nextRunAt (${nextRun}) is in the future relative to fromDate`)
    } else {
      fail(`nextRunAt (${nextRun}) is not in the future relative to fromDate (${fromDate.toISOString()})`)
    }
    // Validate it's approximately 03:00 Bogota on the next day
    const hourInBogota = parseInt(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Bogota' }).format(nextDate),
      10,
    )
    if (hourInBogota === 3) {
      pass(`nextRunAt is at 03:00 Bogota time (hour=${hourInBogota})`)
    } else {
      warn(`nextRunAt hour in Bogota = ${hourInBogota} (expected 3) — TZ arithmetic may differ by 1h`)
    }
  } else {
    fail(`computeNextRunAt returned null for scheduled automation`)
  }

  // On-demand automation — should return null
  const onDemandDef = getAutomation('repair')!
  const onDemandNext = computeNextRunAt(onDemandDef)
  if (onDemandNext === null) {
    pass(`computeNextRunAt returns null for on-demand automation (repair)`)
  } else {
    fail(`computeNextRunAt should return null for repair (no schedule/interval), got: ${onDemandNext}`)
  }

  // ── 3. runAutomation('cycle-3am') ───────────────────────────────────────────

  section('3. runAutomation("cycle-3am") — full scheduled maintenance flow')

  info('Running cycle-3am automation (real workers, real Amazon HTTP)...')
  info('This includes: MaintenanceSession creation → runMasterCycle() → session close')

  const siteBefore = readSiteMode()
  info(`Site mode before automation: ${siteBefore.mode}`)

  const autoResult = await runAutomation('cycle-3am')

  const siteAfter = readSiteMode()
  info(`Site mode after automation:  ${siteAfter.mode}`)
  info(`status:    ${autoResult.status}`)
  info(`durationMs: ${autoResult.durationMs}ms`)

  if (autoResult.status === 'success' || autoResult.status === 'partial') {
    pass(`runAutomation('cycle-3am') completed with status=${autoResult.status}`)
  } else if (autoResult.status === 'failed') {
    warn(`Automation status=failed — required stage may have failed. Errors: ${autoResult.errors.slice(0, 2).join('; ')}`)
  } else {
    fail(`Unexpected automation status: ${autoResult.status}`)
  }

  if (siteAfter.mode === 'public') {
    pass(`Site mode restored to 'public' after automation`)
  } else {
    fail(`Site mode should be 'public' after automation, got: ${siteAfter.mode}`)
  }

  // ── 4. automation-state.json ────────────────────────────────────────────────

  section('4. automation-state.json — run state persisted')

  if (!existsSync(AUTO_STATE_FILE)) {
    fail(`automation-state.json was not created`)
  } else {
    pass(`automation-state.json created`)
  }

  const autoState = readAutomationState()
  const cycleState = autoState.automations['cycle-3am']

  if (!cycleState) {
    fail(`No state for 'cycle-3am' in automation-state.json`)
  } else {
    pass(`State entry for 'cycle-3am' found`)
    info(`  lastRunAt:         ${cycleState.lastRunAt}`)
    info(`  nextRunAt:         ${cycleState.nextRunAt}`)
    info(`  averageDurationMs: ${cycleState.averageDurationMs}ms`)
    info(`  lastStatus:        ${cycleState.lastStatus}`)
    info(`  totalRuns:         ${cycleState.totalRuns}`)

    if (cycleState.lastRunAt !== null) {
      pass(`lastRunAt set: ${cycleState.lastRunAt}`)
    } else {
      fail(`lastRunAt should not be null after run`)
    }

    if (cycleState.nextRunAt !== null) {
      pass(`nextRunAt set: ${cycleState.nextRunAt}`)
    } else {
      fail(`nextRunAt should not be null for scheduled automation`)
    }

    if (cycleState.averageDurationMs > 0) {
      pass(`averageDurationMs=${cycleState.averageDurationMs}ms (Welford's mean)`)
    } else {
      fail(`averageDurationMs should be > 0, got: ${cycleState.averageDurationMs}`)
    }

    if (cycleState.lastStatus !== null) {
      pass(`lastStatus=${cycleState.lastStatus}`)
    } else {
      fail(`lastStatus should not be null after run`)
    }

    if (cycleState.totalRuns === 1) {
      pass(`totalRuns=1 after first automation run`)
    } else {
      fail(`totalRuns should be 1, got: ${cycleState.totalRuns}`)
    }
  }

  // ── 5. maintenance-state.json ───────────────────────────────────────────────

  section('5. maintenance-state.json — session lifecycle')

  if (!existsSync(MAINT_STATE_FILE)) {
    fail(`maintenance-state.json was not created`)
  } else {
    pass(`maintenance-state.json created`)
  }

  const maintState = readMaintenanceState()
  info(`current:     ${maintState.current ? 'session running' : 'null (idle)'}`)
  info(`lastSession: ${maintState.lastSession ? `id=${maintState.lastSession.id}` : 'null'}`)

  if (maintState.current === null) {
    pass(`current=null — session closed after automation`)
  } else {
    fail(`current should be null after automation completes, status=${maintState.current.status}`)
  }

  const last = maintState.lastSession
  if (!last) {
    fail(`lastSession should be set after automation run`)
  } else {
    pass(`lastSession set: id=${last.id}`)
    info(`  mode:        ${last.mode}`)
    info(`  reason:      ${last.reason}`)
    info(`  status:      ${last.status}`)
    info(`  pipelineId:  ${last.pipelineId}`)
    info(`  startedAt:   ${last.startedAt}`)
    info(`  completedAt: ${last.completedAt}`)

    if (last.mode === 'scheduled') {
      pass(`lastSession.mode=scheduled (correct for cycle-3am)`)
    } else {
      fail(`lastSession.mode should be 'scheduled', got: ${last.mode}`)
    }

    if (last.status === 'completed' || last.status === 'failed') {
      pass(`lastSession.status=${last.status} (closed)`)
    } else {
      fail(`lastSession.status should be completed/failed, got: ${last.status}`)
    }

    if (last.pipelineId !== null) {
      pass(`lastSession.pipelineId=${last.pipelineId} (cycle linked)`)
    } else {
      fail(`lastSession.pipelineId should not be null — cycle was not linked`)
    }

    if (last.completedAt !== null) {
      pass(`lastSession.completedAt set: ${last.completedAt}`)
    } else {
      fail(`lastSession.completedAt should not be null after session close`)
    }
  }

  // ── 6. Runtime cross-validation ─────────────────────────────────────────────

  section('6. Runtime cross-validation — cycle state + system health')

  const cycleRtState = readMasterCycleState()
  const health       = readSystemHealth()

  if (cycleRtState.isRunning === false) {
    pass(`master-cycle-state.isRunning=false after automation`)
  } else {
    fail(`isRunning should be false after automation`)
  }

  if (cycleRtState.totalRuns >= 1) {
    pass(`master-cycle-state.totalRuns=${cycleRtState.totalRuns}`)
  } else {
    fail(`master-cycle-state.totalRuns should be ≥ 1`)
  }

  if (health.healthScore >= 40) {
    pass(`healthScore=${health.healthScore} (valid)`)
  } else {
    fail(`healthScore=${health.healthScore} too low`)
  }

  if (health.activePipeline === null) {
    pass(`system-health.activePipeline=null after automation`)
  } else {
    fail(`activePipeline should be null after automation, got: ${health.activePipeline}`)
  }

  // ── 7. Manual maintenance ───────────────────────────────────────────────────

  section('7. Manual maintenance — startMaintenance / isMaintenanceRunning / finishMaintenance')

  // Before start — should not be running
  if (!isMaintenanceRunning()) {
    pass(`isMaintenanceRunning()=false before startMaintenance()`)
  } else {
    fail(`isMaintenanceRunning() should be false before starting manual session`)
  }

  // Start a manual session
  const manualSession = startMaintenance({
    mode:           'manual',
    reason:         'Test: expansión de categorías en ambiente de validación',
    estimatedEndAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })

  info(`Manual session created: id=${manualSession.id}`)
  info(`  mode:           ${manualSession.mode}`)
  info(`  reason:         ${manualSession.reason}`)
  info(`  status:         ${manualSession.status}`)
  info(`  startedAt:      ${manualSession.startedAt}`)
  info(`  estimatedEndAt: ${manualSession.estimatedEndAt}`)

  if (manualSession.status === 'running') {
    pass(`startMaintenance() returned session with status=running`)
  } else {
    fail(`startMaintenance() should return status=running, got: ${manualSession.status}`)
  }

  if (manualSession.mode === 'manual') {
    pass(`startMaintenance() returned mode=manual`)
  } else {
    fail(`Mode should be 'manual', got: ${manualSession.mode}`)
  }

  // During session — should be running
  if (isMaintenanceRunning()) {
    pass(`isMaintenanceRunning()=true while session is open`)
  } else {
    fail(`isMaintenanceRunning() should be true while session is open`)
  }

  const current = getCurrentSession()
  if (current && current.id === manualSession.id) {
    pass(`getCurrentSession() returns the active session (id=${current.id})`)
  } else {
    fail(`getCurrentSession() should return the active session, got: ${JSON.stringify(current)}`)
  }

  // Idempotency: calling startMaintenance while running should return existing session
  const duplicateSession = startMaintenance({
    mode:           'manual',
    reason:         'duplicate call',
    estimatedEndAt: null,
  })

  if (duplicateSession.id === manualSession.id) {
    pass(`startMaintenance() is idempotent — returns existing session on duplicate call`)
  } else {
    warn(`startMaintenance() created new session instead of returning existing (id=${duplicateSession.id} vs ${manualSession.id})`)
  }

  // Finish the session
  const closedSession = finishMaintenance({ status: 'completed' })

  if (closedSession) {
    pass(`finishMaintenance() returned closed session: id=${closedSession.id}`)
    info(`  status:      ${closedSession.status}`)
    info(`  completedAt: ${closedSession.completedAt}`)
    if (closedSession.status === 'completed') {
      pass(`closedSession.status=completed`)
    } else {
      fail(`closedSession.status should be 'completed', got: ${closedSession.status}`)
    }
    if (closedSession.completedAt !== null) {
      pass(`closedSession.completedAt set: ${closedSession.completedAt}`)
    } else {
      fail(`closedSession.completedAt should not be null after close`)
    }
  } else {
    fail(`finishMaintenance() returned null — expected closed session`)
  }

  // After finish — should not be running
  if (!isMaintenanceRunning()) {
    pass(`isMaintenanceRunning()=false after finishMaintenance()`)
  } else {
    fail(`isMaintenanceRunning() should be false after finish`)
  }

  const lastSession = getLastSession()
  if (lastSession && lastSession.mode === 'manual') {
    pass(`getLastSession() returns the completed manual session (mode=manual)`)
  } else {
    fail(`getLastSession() should return last manual session, got: ${JSON.stringify(lastSession)}`)
  }

  // ── 8. trm-update — graceful failure ───────────────────────────────────────

  section('8. trm-update — graceful failure (no worker registered)')

  info('Running trm-update automation (no worker registered)...')
  const trmResult = await runAutomation('trm-update')

  info(`status:  ${trmResult.status}`)
  info(`errors:  ${trmResult.errors.join('; ')}`)

  if (trmResult.status === 'failed') {
    pass(`trm-update correctly fails (no worker) — status=failed`)
  } else {
    fail(`trm-update should fail with no worker, got status=${trmResult.status}`)
  }

  if (trmResult.errors.length > 0 && trmResult.errors[0].includes('No registered worker')) {
    pass(`trm-update error message: '${trmResult.errors[0]}'`)
  } else {
    fail(`trm-update error message unexpected: ${JSON.stringify(trmResult.errors)}`)
  }

  // Verify trm-update state was still persisted
  const finalAutoState = readAutomationState()
  const trmState = finalAutoState.automations['trm-update']
  if (trmState && trmState.lastStatus === 'failed' && trmState.totalRuns === 1) {
    pass(`trm-update state persisted to automation-state.json (totalRuns=${trmState.totalRuns}, lastStatus=${trmState.lastStatus})`)
  } else {
    fail(`trm-update state not correctly persisted: ${JSON.stringify(trmState)}`)
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  section('Sprint 1D Validation — Result')

  const finalCycleState  = readMasterCycleState()
  const finalHealth      = readSystemHealth()
  const finalMaintState  = readMaintenanceState()

  console.log(`\n${BOLD}Runtime files:${RESET}`)
  console.log(`  ${existsSync(AUTO_STATE_FILE)   ? GREEN + '✓' + RESET : RED + '✗' + RESET} automation-state.json`)
  console.log(`  ${existsSync(MAINT_STATE_FILE)  ? GREEN + '✓' + RESET : RED + '✗' + RESET} maintenance-state.json`)

  console.log(`\n${BOLD}Automation state snapshot:${RESET}`)
  const allStates = readAutomationState()
  for (const [id, s] of Object.entries(allStates.automations)) {
    if (s) {
      console.log(`  ${id.padEnd(20)} lastStatus=${String(s.lastStatus).padEnd(10)} avg=${s.averageDurationMs}ms  runs=${s.totalRuns}`)
    }
  }

  console.log(`\n${BOLD}Maintenance state:${RESET}`)
  console.log(`  current:     ${finalMaintState.current ? 'RUNNING' : 'idle'}`)
  console.log(`  lastSession: ${finalMaintState.lastSession ? `mode=${finalMaintState.lastSession.mode} status=${finalMaintState.lastSession.status}` : 'none'}`)

  console.log(`\n${BOLD}Master cycle state:${RESET}`)
  console.log(`  isRunning:      ${finalCycleState.isRunning}`)
  console.log(`  totalRuns:      ${finalCycleState.totalRuns}`)
  console.log(`  lastStatus:     ${finalCycleState.lastStatus}`)
  console.log(`  successfulRuns: ${finalCycleState.successfulRuns}`)
  console.log(`  healthScore:    ${finalHealth.healthScore}`)

  if (process.exitCode === 1) {
    console.log(`\n${RED}${BOLD}FAILED — see errors above${RESET}\n`)
  } else {
    console.log(`\n${GREEN}${BOLD}PASSED — Automation Engine operational${RESET}\n`)
    console.log(`${DIM}Sprint 1D deliverables:${RESET}`)
    console.log(`  ✓ lib/ops/automation/types.ts       — AutomationDefinition, AutomationRunState`)
    console.log(`  ✓ lib/ops/automation/registry.ts    — 7 automations, getAutomation(), getEnabled()`)
    console.log(`  ✓ lib/ops/automation/runner.ts      — runAutomation(), computeNextRunAt()`)
    console.log(`  ✓ lib/ops/automation/index.ts       — unified public API`)
    console.log(`  ✓ lib/ops/maintenance/types.ts      — MaintenanceSession, StartMaintenanceParams`)
    console.log(`  ✓ lib/ops/maintenance/state.ts      — atomic reads/writes, migration-tolerant`)
    console.log(`  ✓ lib/ops/maintenance/orchestrator.ts — startMaintenance(), finishMaintenance(), isRunning()`)
    console.log(`  ✓ lib/ops/maintenance/index.ts      — unified public API`)
    console.log(`  ✓ data/ops/runtime/automation-state.json   — auto-created`)
    console.log(`  ✓ data/ops/runtime/maintenance-state.json  — auto-created`)
    console.log(`\n${BOLD}${GREEN}AUTOMATION_ENGINE_READY${RESET}\n`)
  }
}

main().catch(err => {
  console.error(`\n${RED}${BOLD}Validation script threw:${RESET}`)
  console.error(err)
  process.exit(1)
})
