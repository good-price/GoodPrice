#!/usr/bin/env tsx
/**
 * scripts/validate-sprint-1a.ts
 *
 * Sprint 1A — Foundation Engine validation script.
 *
 * Validates:
 *   1. runMasterCycle() executes without errors
 *   2. Day file created at data/ops/logs/YYYY-MM-DD.json
 *   3. Index file created at data/ops/logs/index.json
 *   4. Log entries are correctly formed (pipelineId consistent, stages ordered)
 *   5. Cycle log has status 'success' and durationMs >= 0
 *   6. getCycleCountdown() and getAllCountdowns() return valid data
 *
 * Usage:
 *   npx tsx scripts/validate-sprint-1a.ts
 */

import { existsSync, readFileSync } from 'fs'
import { join }                     from 'path'
import { runMasterCycle }           from '@/lib/ops/cycle'
import { readLatestLogs, readLogsSummary, getLastLogByJobType } from '@/lib/ops/logs'
import { getCycleCountdown, getAllCountdowns, formatCountdown } from '@/lib/ops/scheduler'
import { MASTER_CYCLE } from '@/lib/ops/cycle'

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
function warn(msg: string)  { console.log(`${YELLOW}⚠${RESET} ${msg}`) }
function hr()               { console.log(`${DIM}${'─'.repeat(60)}${RESET}`) }
function section(title: string) {
  console.log(`\n${BOLD}${title}${RESET}`)
  hr()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}${CYAN}GOODPRICE OPS V3 — Sprint 1A Validation${RESET}`)
  console.log(`${DIM}${new Date().toISOString()}${RESET}\n`)

  // ── 1. Run the master cycle ────────────────────────────────────────────────

  section('1. runMasterCycle()')

  info('Executing master cycle pipeline...')
  const result = await runMasterCycle()
  info(`pipelineId: ${BOLD}${result.pipelineId}${RESET}`)
  info(`status:     ${BOLD}${result.status}${RESET}`)
  info(`durationMs: ${BOLD}${result.durationMs}ms${RESET}`)
  info(`stagesRun:  ${BOLD}${result.stagesRun}/${MASTER_CYCLE.stages.length}${RESET}`)

  if (result.status === 'success')   pass('Cycle completed with status: success')
  else if (result.status === 'partial') warn(`Cycle completed with status: partial`)
  else                               fail(`Cycle completed with status: ${result.status}`)

  if (result.durationMs >= 0)        pass(`durationMs is valid (${result.durationMs}ms)`)
  else                               fail(`durationMs is negative: ${result.durationMs}`)

  if (result.stagesRun === MASTER_CYCLE.stages.length)
    pass(`All ${result.stagesRun} stages executed`)
  else
    fail(`Expected ${MASTER_CYCLE.stages.length} stages, got ${result.stagesRun}`)

  // ── 2. Validate stage ordering ────────────────────────────────────────────

  section('2. Stage ordering and pipelineId consistency')

  const orders = result.stageResults.map(s => s.order)
  const sorted = [...orders].sort((a, b) => a - b)
  if (JSON.stringify(orders) === JSON.stringify(sorted))
    pass(`Stages executed in correct order: [${orders.join(', ')}]`)
  else
    fail(`Stages out of order: [${orders.join(', ')}]`)

  const allMatchPipeline = result.stageResults.every(
    s => s.order >= 1 && s.order <= MASTER_CYCLE.stages.length,
  )
  if (allMatchPipeline) pass(`All stage orders are within range [1..${MASTER_CYCLE.stages.length}]`)
  else                  fail(`Some stage orders are out of range`)

  const allJobTypes = result.stageResults.map(s => s.jobType)
  const expectedTypes = MASTER_CYCLE.stages.map(s => s.jobType)
  const typesMatch = JSON.stringify(allJobTypes) === JSON.stringify(expectedTypes)
  if (typesMatch) pass(`Stage jobTypes match definition: [${allJobTypes.join(', ')}]`)
  else            fail(`Stage jobTypes mismatch. Got: ${allJobTypes}, Expected: ${expectedTypes}`)

  // ── 3. Validate day file ──────────────────────────────────────────────────

  section('3. Data persistence — day file')

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  }).format(new Date())

  const dayFilePath = join(process.cwd(), 'data', 'ops', 'logs', `${today}.json`)

  if (existsSync(dayFilePath)) {
    pass(`Day file created: data/ops/logs/${today}.json`)
  } else {
    fail(`Day file NOT found: data/ops/logs/${today}.json`)
  }

  let dayFileData: { date: string; logs: Array<{ id: string; jobType: string; pipelineId?: string; status: string; durationMs: number }> } | null = null
  try {
    dayFileData = JSON.parse(readFileSync(dayFilePath, 'utf-8'))
    pass(`Day file is valid JSON`)
  } catch {
    fail(`Day file is corrupt or not valid JSON`)
  }

  if (dayFileData) {
    const totalEntries = dayFileData.logs.length
    info(`Entries in day file: ${BOLD}${totalEntries}${RESET} (1 cycle + ${MASTER_CYCLE.stages.length} stages = ${1 + MASTER_CYCLE.stages.length} expected)`)

    if (totalEntries >= 1 + MASTER_CYCLE.stages.length)
      pass(`Day file has expected number of entries (≥${1 + MASTER_CYCLE.stages.length})`)
    else
      warn(`Day file has ${totalEntries} entries, expected ≥${1 + MASTER_CYCLE.stages.length}`)

    // Check cycle log is present
    const cycleEntry = dayFileData.logs.find(l => l.jobType === 'cycle-3am')
    if (cycleEntry) {
      pass(`cycle-3am entry found (id: ${cycleEntry.id})`)
      if (cycleEntry.id === result.pipelineId)
        pass(`cycle-3am id matches pipelineId: ${result.pipelineId}`)
      else
        fail(`cycle-3am id (${cycleEntry.id}) does not match pipelineId (${result.pipelineId})`)
    } else {
      fail(`cycle-3am entry NOT found in day file`)
    }

    // Check stage entries have consistent pipelineId
    const stageEntries = dayFileData.logs.filter(l => l.jobType !== 'cycle-3am')
    const pipelineIds  = new Set(stageEntries.map((l: { pipelineId?: string }) => l.pipelineId))
    if (pipelineIds.size === 1 && pipelineIds.has(result.pipelineId))
      pass(`All stage entries share pipelineId: ${result.pipelineId}`)
    else if (pipelineIds.size === 0)
      warn(`No stage entries found (expected ${MASTER_CYCLE.stages.length})`)
    else
      fail(`Stage entries have inconsistent pipelineIds: ${[...pipelineIds].join(', ')}`)

    // Check all durationMs are non-negative
    const invalidDurations = dayFileData.logs.filter(l => l.durationMs < 0)
    if (invalidDurations.length === 0)
      pass(`All log entries have valid durationMs (≥ 0)`)
    else
      fail(`${invalidDurations.length} entries have negative durationMs`)
  }

  // ── 4. Validate index file ────────────────────────────────────────────────

  section('4. Data persistence — index file')

  const indexPath = join(process.cwd(), 'data', 'ops', 'logs', 'index.json')

  if (existsSync(indexPath)) {
    pass(`Index file created: data/ops/logs/index.json`)
  } else {
    fail(`Index file NOT found: data/ops/logs/index.json`)
  }

  try {
    const indexData = JSON.parse(readFileSync(indexPath, 'utf-8')) as Array<{
      date: string; totalRuns: number; failedRuns: number; cycleStatus: string | null; lastCycleAt: string | null
    }>
    pass(`Index file is valid JSON`)

    const todayEntry = indexData.find(e => e.date === today)
    if (todayEntry) {
      pass(`Index has entry for today (${today})`)
      info(`  totalRuns:    ${todayEntry.totalRuns}`)
      info(`  failedRuns:   ${todayEntry.failedRuns}`)
      info(`  cycleStatus:  ${todayEntry.cycleStatus}`)
      info(`  lastCycleAt:  ${todayEntry.lastCycleAt}`)

      if (todayEntry.cycleStatus === result.status)
        pass(`Index cycleStatus matches run result: ${result.status}`)
      else
        fail(`Index cycleStatus (${todayEntry.cycleStatus}) ≠ run status (${result.status})`)

      if (todayEntry.lastCycleAt)
        pass(`Index lastCycleAt is set: ${todayEntry.lastCycleAt}`)
      else
        fail(`Index lastCycleAt is null`)
    } else {
      fail(`Index has NO entry for today (${today})`)
    }
  } catch {
    fail(`Index file is corrupt or not valid JSON`)
  }

  // ── 5. Validate reader functions ──────────────────────────────────────────

  section('5. Reader functions')

  const latestLogs = readLatestLogs(20)
  if (latestLogs.length > 0) pass(`readLatestLogs() returned ${latestLogs.length} entries`)
  else                        fail(`readLatestLogs() returned 0 entries`)

  const summary = readLogsSummary()
  if (summary.length > 0) pass(`readLogsSummary() returned ${summary.length} index entries`)
  else                     fail(`readLogsSummary() returned empty index`)

  const lastCycleLog = getLastLogByJobType('cycle-3am')
  if (lastCycleLog) {
    pass(`getLastLogByJobType('cycle-3am') found entry (id: ${lastCycleLog.id})`)
    if (lastCycleLog.id === result.pipelineId)
      pass(`Last cycle log matches current pipelineId`)
    else
      warn(`Last cycle log id (${lastCycleLog.id}) ≠ current pipelineId (${result.pipelineId}) — may be from a previous run`)
  } else {
    fail(`getLastLogByJobType('cycle-3am') returned null`)
  }

  // ── 6. Validate countdown engine ─────────────────────────────────────────

  section('6. Countdown Engine')

  const cycleCountdown = getCycleCountdown()
  pass(`getCycleCountdown() executed without error`)
  info(`  nextCycleAt:    ${BOLD}${cycleCountdown.nextCycleAt}${RESET}`)
  info(`  remainingMs:    ${cycleCountdown.remainingMs}ms`)
  info(`  formatted:      ${BOLD}${formatCountdown(cycleCountdown.remainingMs)}${RESET}`)
  info(`  isOverdue:      ${cycleCountdown.isOverdue}`)
  info(`  lastStatus:     ${cycleCountdown.lastStatus}`)
  info(`  lastDurationMs: ${cycleCountdown.lastDurationMs}ms`)

  const nextCycleDate = new Date(cycleCountdown.nextCycleAt)
  if (!isNaN(nextCycleDate.getTime())) pass(`nextCycleAt is a valid ISO date`)
  else                                  fail(`nextCycleAt is not a valid date: ${cycleCountdown.nextCycleAt}`)

  if (cycleCountdown.remainingMs > 0 || cycleCountdown.remainingMs < 0)
    pass(`remainingMs is non-zero (${cycleCountdown.remainingMs}ms)`)
  else
    warn(`remainingMs is exactly 0 — this is unusual`)

  const allCd = getAllCountdowns()
  if (allCd.jobs.length === 8)   pass(`getAllCountdowns() returned 8 job countdowns`)
  else                           warn(`getAllCountdowns() returned ${allCd.jobs.length} job countdowns (expected 8)`)

  // Print all job countdowns
  console.log(`\n${DIM}Job countdowns:${RESET}`)
  for (const job of allCd.jobs) {
    const remaining = job.nextRunAt
      ? formatCountdown(job.remainingMs)
      : 'never run'
    const overdue = job.isOverdue ? `${RED}OVERDUE${RESET}` : `${GREEN}OK${RESET}`
    const cycle = job.partOfCycle ? `${DIM}[cycle]${RESET}` : `${DIM}[standalone]${RESET}`
    console.log(
      `  ${job.label.padEnd(20)} ${remaining.padEnd(12)} ${overdue} ${cycle}`,
    )
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  section('Sprint 1A Validation — Result')

  if (process.exitCode === 1) {
    console.log(`\n${RED}${BOLD}FAILED — see errors above${RESET}\n`)
  } else {
    console.log(`\n${GREEN}${BOLD}PASSED — Foundation Engine is operational${RESET}\n`)
    console.log(`${DIM}Files created:${RESET}`)
    console.log(`  data/ops/logs/${today}.json`)
    console.log(`  data/ops/logs/index.json`)
    console.log(`\n${DIM}Ready for Sprint 1B:${RESET}`)
    console.log(`  executeStage() → connect real job workers`)
    console.log(`  SiteMode → extend to 4 modes`)
    console.log(`  Nerve Center → consume logs + countdown data`)
    console.log()
  }
}

main().catch(err => {
  console.error(`\n${RED}${BOLD}Validation script threw an exception:${RESET}`)
  console.error(err)
  process.exit(1)
})
