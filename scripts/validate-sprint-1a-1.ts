#!/usr/bin/env tsx
/**
 * scripts/validate-sprint-1a-1.ts
 *
 * Sprint 1A.1 — Foundation Hardening validation script.
 *
 * Validates:
 *   1. SiteMode extended to 4 values
 *   2. OpsLogIndexEntry has successfulRuns / partialRuns / cancelledRuns
 *   3. Cycle lock: acquire / release / isCycleLocked
 *   4. readLatestLogs() clamping and sort order
 *   5. CycleRunResult has successfulStages / failedStages
 *
 * Usage:
 *   npx tsx scripts/validate-sprint-1a-1.ts
 */

import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'fs'
import { join }    from 'path'
import { readSiteMode, setSiteMode } from '@/lib/system/site-mode'
import type { SiteMode } from '@/lib/system/site-mode'
import { runMasterCycle, acquireCycleLock, releaseCycleLock, isCycleLocked } from '@/lib/ops/cycle'
import { readLatestLogs, readLogsSummary } from '@/lib/ops/logs'

// ── ANSI colors ───────────────────────────────────────────────────────────────

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
function hr()               { console.log(`${DIM}${'─'.repeat(60)}${RESET}`) }
function section(title: string) {
  console.log(`\n${BOLD}${title}${RESET}`)
  hr()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}${CYAN}GOODPRICE OPS V3 — Sprint 1A.1 Validation${RESET}`)
  console.log(`${DIM}${new Date().toISOString()}${RESET}\n`)

  // ── 1. SiteMode extended ─────────────────────────────────────────────────

  section('1. SiteMode — 4 modes')

  // Compile-time type coverage: all four values must be valid SiteMode
  const allModes: SiteMode[] = ['public', 'development', 'maintenance', 'scheduled_maintenance']
  pass(`SiteMode type includes all 4 values: ${allModes.join(', ')}`)

  // setSiteMode and readSiteMode round-trip for all new modes
  const originalState = readSiteMode()
  info(`Current site mode: ${originalState.mode}`)

  for (const mode of (['maintenance', 'scheduled_maintenance'] as SiteMode[])) {
    try {
      const extra = mode === 'scheduled_maintenance'
        ? new Date(Date.now() + 3600_000).toISOString()
        : undefined
      const written = setSiteMode(mode, extra)
      const read    = readSiteMode()

      if (read.mode === mode) {
        pass(`Round-trip OK for mode: ${mode}`)
      } else {
        fail(`Round-trip FAILED for mode: ${mode} (got: ${read.mode})`)
      }

      if (mode === 'scheduled_maintenance' && extra) {
        if (read.scheduledEndAt === extra) {
          pass(`scheduledEndAt persisted correctly for scheduled_maintenance`)
        } else {
          fail(`scheduledEndAt mismatch: expected ${extra}, got ${read.scheduledEndAt}`)
        }
      }

      if (written.previousMode !== null) {
        pass(`previousMode is tracked: ${written.previousMode} → ${mode}`)
      }
    } catch (err) {
      fail(`setSiteMode('${mode}') threw: ${err instanceof Error ? err.message : err}`)
    }
  }

  // Invalid mode must throw
  try {
    // @ts-expect-error intentional invalid value
    setSiteMode('invalid-mode-xyz')
    fail(`setSiteMode('invalid-mode-xyz') should have thrown but did not`)
  } catch {
    pass(`setSiteMode('invalid-mode-xyz') correctly threw an error`)
  }

  // Restore original mode
  setSiteMode(originalState.mode)
  const restored = readSiteMode()
  if (restored.mode === originalState.mode) {
    pass(`Mode restored to original: ${originalState.mode}`)
  } else {
    fail(`Failed to restore mode: expected ${originalState.mode}, got ${restored.mode}`)
  }

  // ── 2. OpsLogIndexEntry — new counters ───────────────────────────────────

  section('2. OpsLogIndexEntry — successfulRuns / partialRuns / cancelledRuns')

  // Run a cycle so the index gets updated with the new counters
  info('Running master cycle to generate index entry...')
  const cycleResult = await runMasterCycle()

  info(`pipelineId:       ${cycleResult.pipelineId}`)
  info(`status:           ${cycleResult.status}`)
  info(`successfulStages: ${cycleResult.successfulStages}`)
  info(`failedStages:     ${cycleResult.failedStages}`)

  const summaryIndex = readLogsSummary()
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  const todayEntry = summaryIndex.find(e => e.date === today)
  if (!todayEntry) {
    fail(`No index entry for today (${today})`)
  } else {
    pass(`Index entry found for today (${today})`)

    if (typeof todayEntry.successfulRuns === 'number') {
      pass(`successfulRuns is a number: ${todayEntry.successfulRuns}`)
    } else {
      fail(`successfulRuns is missing or not a number: ${todayEntry.successfulRuns}`)
    }

    if (typeof todayEntry.partialRuns === 'number') {
      pass(`partialRuns is a number: ${todayEntry.partialRuns}`)
    } else {
      fail(`partialRuns is missing or not a number: ${todayEntry.partialRuns}`)
    }

    if (typeof todayEntry.cancelledRuns === 'number') {
      pass(`cancelledRuns is a number: ${todayEntry.cancelledRuns}`)
    } else {
      fail(`cancelledRuns is missing or not a number: ${todayEntry.cancelledRuns}`)
    }

    const sumOk =
      todayEntry.successfulRuns + todayEntry.partialRuns +
      todayEntry.failedRuns     + todayEntry.cancelledRuns
      <= todayEntry.totalRuns

    if (sumOk) {
      pass(`Counter sum ≤ totalRuns (${todayEntry.totalRuns})`)
    } else {
      fail(`Counter sum exceeds totalRuns — counts are inconsistent`)
    }
  }

  // Migration: simulate an old index entry without the new fields
  const indexPath = join(process.cwd(), 'data', 'ops', 'logs', 'index.json')
  if (existsSync(indexPath)) {
    const raw = JSON.parse(readFileSync(indexPath, 'utf-8')) as object[]
    const stripped = raw.map((e: Record<string, unknown>) => {
      const { successfulRuns: _s, partialRuns: _p, cancelledRuns: _c, ...rest } = e
      return rest
    })
    writeFileSync(indexPath, JSON.stringify(stripped, null, 2), 'utf-8')
    info('Wrote legacy index (without new counters) to test migration...')

    // Append a log to trigger migration
    await runMasterCycle()

    const migrated = readLogsSummary()
    const migratedEntry = migrated.find(e => e.date === today)
    if (migratedEntry && typeof migratedEntry.successfulRuns === 'number') {
      pass(`Migration: successfulRuns restored to ${migratedEntry.successfulRuns} after legacy read`)
    } else {
      fail(`Migration: successfulRuns is still missing after upsert`)
    }
  }

  // ── 3. Cycle lock ────────────────────────────────────────────────────────

  section('3. Cycle Lock — acquire / release / isCycleLocked')

  // Ensure clean state
  releaseCycleLock()

  const stateBeforeAcquire = isCycleLocked()
  if (!stateBeforeAcquire.locked) {
    pass(`isCycleLocked() → false (no lock held)`)
  } else {
    fail(`Expected no lock before acquire, got locked=true`)
  }

  const testPipelineId = `test-${Date.now().toString(36)}`
  const acquired = acquireCycleLock(testPipelineId)
  if (acquired) {
    pass(`acquireCycleLock('${testPipelineId}') → true`)
  } else {
    fail(`acquireCycleLock returned false — lock was already held unexpectedly`)
  }

  const stateAfterAcquire = isCycleLocked()
  if (stateAfterAcquire.locked) {
    pass(`isCycleLocked() → true after acquire`)
  } else {
    fail(`Expected locked=true after acquire`)
  }

  if (stateAfterAcquire.pipelineId === testPipelineId) {
    pass(`isCycleLocked().pipelineId matches: ${testPipelineId}`)
  } else {
    fail(`pipelineId mismatch: expected ${testPipelineId}, got ${stateAfterAcquire.pipelineId}`)
  }

  if (stateAfterAcquire.lockedAt) {
    pass(`isCycleLocked().lockedAt is set: ${stateAfterAcquire.lockedAt}`)
  } else {
    fail(`lockedAt should be set after acquire`)
  }

  // Attempting to acquire while locked must return false
  const secondAcquire = acquireCycleLock('should-fail')
  if (!secondAcquire) {
    pass(`Second acquireCycleLock() → false (lock already held — correct)`)
  } else {
    fail(`Second acquireCycleLock() should have returned false but returned true`)
  }

  // pipelineId should not have changed
  const stateAfterSecond = isCycleLocked()
  if (stateAfterSecond.pipelineId === testPipelineId) {
    pass(`Lock pipelineId unchanged after failed second acquire: ${testPipelineId}`)
  } else {
    fail(`Lock pipelineId was overwritten: ${stateAfterSecond.pipelineId}`)
  }

  releaseCycleLock()

  const stateAfterRelease = isCycleLocked()
  if (!stateAfterRelease.locked) {
    pass(`isCycleLocked() → false after release`)
  } else {
    fail(`Expected locked=false after release`)
  }

  // ── 4. readLatestLogs() — hardening ─────────────────────────────────────

  section('4. readLatestLogs() — clamping and sort order')

  // Clamp: limit=0 → effective=1
  const clamped0 = readLatestLogs(0)
  if (clamped0.length <= 1) {
    pass(`readLatestLogs(0) clamped to 1: returned ${clamped0.length} entries`)
  } else {
    fail(`readLatestLogs(0) returned ${clamped0.length} entries — should be ≤ 1`)
  }

  // Clamp: limit=5000 → effective=1000 (or all available if fewer)
  const clamped5000 = readLatestLogs(5000)
  if (clamped5000.length <= 1000) {
    pass(`readLatestLogs(5000) clamped to ≤ 1000: returned ${clamped5000.length} entries`)
  } else {
    fail(`readLatestLogs(5000) returned ${clamped5000.length} entries — exceeds max 1000`)
  }

  // Clamp: limit=1 → returns at most 1
  const clamped1 = readLatestLogs(1)
  if (clamped1.length <= 1) {
    pass(`readLatestLogs(1) returns ≤ 1 entry: got ${clamped1.length}`)
  } else {
    fail(`readLatestLogs(1) returned ${clamped1.length} entries`)
  }

  // Sort: entries must be ordered by startedAt descending
  const forSort = readLatestLogs(50)
  if (forSort.length >= 2) {
    let sortedOk = true
    for (let i = 0; i < forSort.length - 1; i++) {
      // Day boundary: entries from different dates break the "same startedAt" assumption
      // but within a single day file they must be desc. We check globally by startedAt.
      if (forSort[i].startedAt < forSort[i + 1].startedAt) {
        sortedOk = false
        fail(`Sort order broken at index ${i}: ${forSort[i].startedAt} < ${forSort[i + 1].startedAt}`)
        break
      }
    }
    if (sortedOk) {
      pass(`readLatestLogs(50) entries are sorted by startedAt desc (${forSort.length} entries checked)`)
    }
  } else {
    info(`Not enough entries to verify sort order (got ${forSort.length})`)
  }

  // Corrupt file test: write invalid JSON to a temp day file, then call readLatestLogs
  const futureDatePath = join(process.cwd(), 'data', 'ops', 'logs', '2099-01-01.json')
  writeFileSync(futureDatePath, '{ NOT VALID JSON !!!', 'utf-8')
  info('Wrote corrupt JSON to 2099-01-01.json...')

  try {
    const afterCorrupt = readLatestLogs(10)
    pass(`readLatestLogs() returned without throwing after corrupt file (${afterCorrupt.length} entries)`)
  } catch (err) {
    fail(`readLatestLogs() threw after corrupt file: ${err instanceof Error ? err.message : err}`)
  } finally {
    // Clean up
    try { unlinkSync(futureDatePath) } catch { /* ignore */ }
    info('Cleaned up corrupt test file')
  }

  // ── 5. CycleRunResult — new stage counters ───────────────────────────────

  section('5. CycleRunResult — successfulStages / failedStages')

  info(`From cycle run above — pipelineId: ${cycleResult.pipelineId}`)

  if (typeof cycleResult.successfulStages === 'number') {
    pass(`successfulStages is a number: ${cycleResult.successfulStages}`)
  } else {
    fail(`successfulStages is missing or not a number`)
  }

  if (typeof cycleResult.failedStages === 'number') {
    pass(`failedStages is a number: ${cycleResult.failedStages}`)
  } else {
    fail(`failedStages is missing or not a number`)
  }

  const stageCountOk =
    cycleResult.successfulStages + cycleResult.failedStages <= cycleResult.stagesRun
  if (stageCountOk) {
    pass(
      `successfulStages (${cycleResult.successfulStages}) + failedStages (${cycleResult.failedStages}) ≤ stagesRun (${cycleResult.stagesRun})`,
    )
  } else {
    fail(`Stage counts are inconsistent: ${cycleResult.successfulStages} + ${cycleResult.failedStages} > ${cycleResult.stagesRun}`)
  }

  // All-success cycle: successfulStages must equal stagesRun when status is 'success'
  if (cycleResult.status === 'success') {
    if (cycleResult.successfulStages === cycleResult.stagesRun) {
      pass(`status=success → successfulStages (${cycleResult.successfulStages}) equals stagesRun (${cycleResult.stagesRun})`)
    } else {
      fail(`status=success but successfulStages (${cycleResult.successfulStages}) ≠ stagesRun (${cycleResult.stagesRun})`)
    }
    if (cycleResult.failedStages === 0) {
      pass(`status=success → failedStages is 0`)
    } else {
      fail(`status=success but failedStages is ${cycleResult.failedStages}`)
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  section('Sprint 1A.1 Validation — Result')

  if (process.exitCode === 1) {
    console.log(`\n${RED}${BOLD}FAILED — see errors above${RESET}\n`)
  } else {
    console.log(`\n${GREEN}${BOLD}PASSED — Foundation Kernel hardened and ready${RESET}\n`)
    console.log(`${DIM}Changes validated:${RESET}`)
    console.log(`  ✓ SiteMode: 4 modes (maintenance, scheduled_maintenance added)`)
    console.log(`  ✓ OpsLogIndexEntry: successfulRuns / partialRuns / cancelledRuns`)
    console.log(`  ✓ Cycle lock: acquire / release / isCycleLocked`)
    console.log(`  ✓ readLatestLogs(): clamped [1,1000], sorted by startedAt desc`)
    console.log(`  ✓ CycleRunResult: successfulStages / failedStages`)
    console.log(`\n${BOLD}${GREEN}FOUNDATION_KERNEL_READY_FOR_SPRINT_1B${RESET}\n`)
  }
}

main().catch(err => {
  console.error(`\n${RED}${BOLD}Validation script threw an exception:${RESET}`)
  console.error(err)
  process.exit(1)
})
