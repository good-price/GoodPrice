#!/usr/bin/env tsx
/**
 * scripts/validate-sprint-1d1.ts
 *
 * Sprint 1D.1 — Scheduler Hardening validation suite.
 *
 * Tests the time utilities library without running the Master Cycle.
 * All tests use fixed "from" dates to make results deterministic.
 *
 * Bogota is UTC-5, no DST. Conversions:
 *   UTC 08:00 → Bogota 03:00
 *   UTC 05:00 → Bogota 00:00
 *   UTC 04:59 → Bogota 23:59 (previous calendar day)
 *   UTC 05:01 → Bogota 00:01
 *
 * Usage:
 *   npx tsx scripts/validate-sprint-1d1.ts
 */

import {
  getBogotaNow,
  getBogotaDate,
  getBogotaISOString,
  getBogotaHour,
  getNextOccurrenceAtHour,
  daysBetween,
  formatDuration,
  getRemainingMs,
  getRemainingSeconds,
  getRemainingDuration,
  BOGOTA_TZ,
}                             from '@/lib/ops/time'
import {
  computeNextRunAt,
  getAutomation,
  getAllAutomations,
}                             from '@/lib/ops/automation'

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

// ── Fixed test dates ──────────────────────────────────────────────────────────
// All dates in UTC. Bogota = UTC-5.
//
//  UTC 2026-06-18T08:00:00Z  →  Bogota 2026-06-18 03:00 (exactly at target hour)
//  UTC 2026-06-18T10:00:00Z  →  Bogota 2026-06-18 05:00 (5 AM, past 3 AM)
//  UTC 2026-06-19T04:59:59Z  →  Bogota 2026-06-18 23:59 (23:59 Bogota, past 3 AM)
//  UTC 2026-06-18T05:01:00Z  →  Bogota 2026-06-18 00:01 (just past midnight, before 3 AM)
//  UTC 2026-06-18T07:59:00Z  →  Bogota 2026-06-18 02:59 (1 min before 3 AM)
//  UTC 2026-06-18T05:00:00Z  →  Bogota 2026-06-18 00:00 (midnight exactly)

const T_AT_3AM     = new Date('2026-06-18T08:00:00Z')  // exactly 03:00 Bogota → next is tomorrow
const T_AT_5AM     = new Date('2026-06-18T10:00:00Z')  // 05:00 Bogota (past 3AM)
const T_AT_2359    = new Date('2026-06-19T04:59:59Z')  // 23:59 Bogota June 18
const T_AT_0001    = new Date('2026-06-18T05:01:00Z')  // 00:01 Bogota
const T_AT_0259    = new Date('2026-06-18T07:59:00Z')  // 02:59 Bogota (just before 3AM)
const T_AT_MIDNIGHT = new Date('2026-06-18T05:00:00Z') // 00:00 Bogota

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log(`\n${BOLD}${CYAN}GOODPRICE OPS V3 — Sprint 1D.1 Scheduler Hardening${RESET}`)
  console.log(`${DIM}${new Date().toISOString()}${RESET}`)
  console.log(`${DIM}Timezone under test: ${BOGOTA_TZ} (UTC-5, no DST)${RESET}\n`)

  // ── 1. getBogotaDate / getBogotaHour ───────────────────────────────────────

  section('1. getBogotaDate() / getBogotaHour() — field extraction')

  const d5am = getBogotaDate(T_AT_5AM)
  info(`getBogotaDate(2026-06-18T10:00Z) → ${JSON.stringify(d5am)}`)

  if (d5am.year === 2026 && d5am.month === 6 && d5am.day === 18) {
    pass(`getBogotaDate: year=2026, month=6, day=18 ✓`)
  } else {
    fail(`getBogotaDate date fields wrong: ${d5am.year}-${d5am.month}-${d5am.day}`)
  }

  if (d5am.hour === 5) {
    pass(`getBogotaDate: hour=5 (UTC 10 → Bogota 5) ✓`)
  } else {
    fail(`getBogotaDate: expected hour=5, got ${d5am.hour}`)
  }

  if (d5am.dateString === '2026-06-18') {
    pass(`getBogotaDate: dateString='2026-06-18' ✓`)
  } else {
    fail(`getBogotaDate: dateString='${d5am.dateString}' expected '2026-06-18'`)
  }

  if (d5am.localISOString === '2026-06-18T05:00:00') {
    pass(`getBogotaDate: localISOString='2026-06-18T05:00:00' ✓`)
  } else {
    fail(`getBogotaDate: localISOString='${d5am.localISOString}' expected '2026-06-18T05:00:00'`)
  }

  // 23:59 Bogota case
  const d2359 = getBogotaDate(T_AT_2359)
  info(`getBogotaDate(2026-06-19T04:59:59Z) → day=${d2359.day} hour=${d2359.hour} minute=${d2359.minute}`)
  if (d2359.day === 18 && d2359.hour === 23 && d2359.minute === 59) {
    pass(`getBogotaDate: 23:59 Bogota correctly maps to June 18 (UTC June 19) ✓`)
  } else {
    fail(`getBogotaDate 23:59 case: day=${d2359.day}, hour=${d2359.hour}, minute=${d2359.minute}`)
  }

  // Midnight Bogota
  const dMidnight = getBogotaDate(T_AT_MIDNIGHT)
  if (dMidnight.hour === 0 && dMidnight.minute === 0) {
    pass(`getBogotaDate: midnight (00:00) ✓`)
  } else {
    fail(`getBogotaDate midnight: hour=${dMidnight.hour}, minute=${dMidnight.minute}`)
  }

  // getBogotaHour
  if (getBogotaHour(T_AT_5AM) === 5)    pass(`getBogotaHour(T_AT_5AM)=5 ✓`)
  else fail(`getBogotaHour(T_AT_5AM) expected 5, got ${getBogotaHour(T_AT_5AM)}`)

  if (getBogotaHour(T_AT_2359) === 23)  pass(`getBogotaHour(T_AT_2359)=23 ✓`)
  else fail(`getBogotaHour(T_AT_2359) expected 23, got ${getBogotaHour(T_AT_2359)}`)

  if (getBogotaHour(T_AT_0001) === 0)   pass(`getBogotaHour(T_AT_0001)=0 ✓`)
  else fail(`getBogotaHour(T_AT_0001) expected 0, got ${getBogotaHour(T_AT_0001)}`)

  // getBogotaISOString
  const iso = getBogotaISOString(T_AT_5AM)
  if (iso === T_AT_5AM.toISOString()) pass(`getBogotaISOString returns UTC ISO string ✓`)
  else fail(`getBogotaISOString mismatch: ${iso}`)

  // ── 2. getNextOccurrenceAtHour — boundary conditions ──────────────────────

  section('2. getNextOccurrenceAtHour() — 03:00 Bogota boundary scenarios')

  const verifyBogotaHour3 = (result: Date, label: string) => {
    const resultHourBogota = getBogotaHour(result)
    if (resultHourBogota === 3) {
      pass(`${label}: result ${result.toISOString()} → Bogota hour=3 ✓`)
    } else {
      fail(`${label}: result ${result.toISOString()} → Bogota hour=${resultHourBogota}, expected 3`)
    }
  }

  const verifyFuture = (result: Date, from: Date, label: string) => {
    if (result > from) {
      pass(`${label}: result is in the future relative to from ✓`)
    } else {
      fail(`${label}: result ${result.toISOString()} is NOT in the future (from=${from.toISOString()})`)
    }
  }

  const verifyDateBogota = (result: Date, expectedDay: number, label: string) => {
    const d = getBogotaDate(result)
    if (d.day === expectedDay) {
      pass(`${label}: Bogota calendar day=${d.day} (expected ${expectedDay}) ✓`)
    } else {
      fail(`${label}: Bogota calendar day=${d.day}, expected ${expectedDay}`)
    }
  }

  // Scenario A: 5AM Bogota — already past 3AM today → should give tomorrow
  const nextA = getNextOccurrenceAtHour(3, BOGOTA_TZ, T_AT_5AM)
  info(`Scenario A (5AM Bogota): getNextOccurrenceAtHour(3) → ${nextA.toISOString()}`)
  verifyBogotaHour3(nextA, 'Scenario A')
  verifyFuture(nextA, T_AT_5AM, 'Scenario A')
  verifyDateBogota(nextA, 19, 'Scenario A')  // tomorrow = June 19

  // Scenario B: 23:59 Bogota — already past 3AM today → should give tomorrow
  const nextB = getNextOccurrenceAtHour(3, BOGOTA_TZ, T_AT_2359)
  info(`Scenario B (23:59 Bogota): getNextOccurrenceAtHour(3) → ${nextB.toISOString()}`)
  verifyBogotaHour3(nextB, 'Scenario B')
  verifyFuture(nextB, T_AT_2359, 'Scenario B')
  verifyDateBogota(nextB, 19, 'Scenario B')  // tomorrow = June 19 (Bogota)

  // Scenario C: 00:01 Bogota — before 3AM → should give today
  const nextC = getNextOccurrenceAtHour(3, BOGOTA_TZ, T_AT_0001)
  info(`Scenario C (00:01 Bogota): getNextOccurrenceAtHour(3) → ${nextC.toISOString()}`)
  verifyBogotaHour3(nextC, 'Scenario C')
  verifyFuture(nextC, T_AT_0001, 'Scenario C')
  verifyDateBogota(nextC, 18, 'Scenario C')  // same day = June 18

  // Scenario D: 02:59 Bogota — 1 min before target → should give today
  const nextD = getNextOccurrenceAtHour(3, BOGOTA_TZ, T_AT_0259)
  info(`Scenario D (02:59 Bogota): getNextOccurrenceAtHour(3) → ${nextD.toISOString()}`)
  verifyBogotaHour3(nextD, 'Scenario D')
  verifyFuture(nextD, T_AT_0259, 'Scenario D')
  verifyDateBogota(nextD, 18, 'Scenario D')  // same day = June 18

  // Scenario E: exactly at 03:00 Bogota → should give TOMORROW (not "now")
  const nextE = getNextOccurrenceAtHour(3, BOGOTA_TZ, T_AT_3AM)
  info(`Scenario E (exactly 03:00 Bogota): getNextOccurrenceAtHour(3) → ${nextE.toISOString()}`)
  verifyBogotaHour3(nextE, 'Scenario E')
  verifyFuture(nextE, T_AT_3AM, 'Scenario E')
  verifyDateBogota(nextE, 19, 'Scenario E')  // tomorrow = June 19

  // Scenario F: midnight exactly → should give today
  const nextF = getNextOccurrenceAtHour(3, BOGOTA_TZ, T_AT_MIDNIGHT)
  info(`Scenario F (00:00 Bogota midnight): getNextOccurrenceAtHour(3) → ${nextF.toISOString()}`)
  verifyBogotaHour3(nextF, 'Scenario F')
  verifyFuture(nextF, T_AT_MIDNIGHT, 'Scenario F')
  verifyDateBogota(nextF, 18, 'Scenario F')  // same day = June 18

  // Scenario G: far future date (2030)
  const farFuture = new Date('2030-01-15T14:00:00Z')  // 9AM Bogota
  const nextG = getNextOccurrenceAtHour(3, BOGOTA_TZ, farFuture)
  info(`Scenario G (2030-01-15 9AM Bogota): getNextOccurrenceAtHour(3) → ${nextG.toISOString()}`)
  verifyBogotaHour3(nextG, 'Scenario G')
  verifyFuture(nextG, farFuture, 'Scenario G')

  // ── 3. computeNextRunAt — automation integration ───────────────────────────

  section('3. computeNextRunAt() — automation integration (no manual UTC offsets)')

  const cycleDef   = getAutomation('cycle-3am')!
  const liveDef    = getAutomation('live-truth')!
  const trmDef     = getAutomation('trm-update')!

  // cycle-3am (scheduledHour: 3, timezone: America/Bogota)
  const cycleNext5am = computeNextRunAt(cycleDef, T_AT_5AM)
  info(`computeNextRunAt('cycle-3am', 5AM Bogota) → ${cycleNext5am}`)
  if (cycleNext5am !== null) {
    const d = getBogotaDate(new Date(cycleNext5am))
    if (d.hour === 3 && d.day === 19) {
      pass(`computeNextRunAt('cycle-3am'): hour=3, day=19 in Bogota ✓`)
    } else {
      fail(`computeNextRunAt('cycle-3am'): hour=${d.hour}, day=${d.day} (expected 3, 19)`)
    }
  } else {
    fail(`computeNextRunAt('cycle-3am') returned null`)
  }

  const cycleNext0001 = computeNextRunAt(cycleDef, T_AT_0001)
  info(`computeNextRunAt('cycle-3am', 00:01 Bogota) → ${cycleNext0001}`)
  if (cycleNext0001 !== null) {
    const d = getBogotaDate(new Date(cycleNext0001))
    if (d.hour === 3 && d.day === 18) {
      pass(`computeNextRunAt('cycle-3am', 00:01): hour=3, day=18 in Bogota ✓`)
    } else {
      fail(`computeNextRunAt('cycle-3am', 00:01): hour=${d.hour}, day=${d.day} (expected 3, 18)`)
    }
  } else {
    fail(`computeNextRunAt('cycle-3am', 00:01) returned null`)
  }

  const cycleNext2359 = computeNextRunAt(cycleDef, T_AT_2359)
  info(`computeNextRunAt('cycle-3am', 23:59 Bogota) → ${cycleNext2359}`)
  if (cycleNext2359 !== null) {
    const d = getBogotaDate(new Date(cycleNext2359))
    if (d.hour === 3 && d.day === 19) {
      pass(`computeNextRunAt('cycle-3am', 23:59): hour=3, day=19 in Bogota ✓`)
    } else {
      fail(`computeNextRunAt('cycle-3am', 23:59): hour=${d.hour}, day=${d.day} (expected 3, 19)`)
    }
  } else {
    fail(`computeNextRunAt('cycle-3am', 23:59) returned null`)
  }

  // live-truth (on-demand, no schedule) → must return null
  const liveNext = computeNextRunAt(liveDef, T_AT_5AM)
  if (liveNext === null) {
    pass(`computeNextRunAt('live-truth') = null (on-demand, no schedule) ✓`)
  } else {
    fail(`computeNextRunAt('live-truth') should be null, got: ${liveNext}`)
  }

  // trm-update (on-demand, no schedule) → must return null
  const trmNext = computeNextRunAt(trmDef, T_AT_5AM)
  if (trmNext === null) {
    pass(`computeNextRunAt('trm-update') = null (on-demand, no schedule) ✓`)
  } else {
    fail(`computeNextRunAt('trm-update') should be null, got: ${trmNext}`)
  }

  // ── 4. Countdown engine ────────────────────────────────────────────────────

  section('4. Countdown engine — getRemainingMs / getRemainingSeconds / getRemainingDuration')

  // Target: cycle at 3AM Bogota on June 19 = 2026-06-19T08:00:00Z
  const cycleTargetISO = '2026-06-19T08:00:00.000Z'
  const fromDate       = T_AT_5AM   // 2026-06-18T10:00:00Z (5AM Bogota)

  const remainMs  = getRemainingMs(cycleTargetISO, fromDate)
  const remainSec = getRemainingSeconds(cycleTargetISO, fromDate)
  const remainDur = getRemainingDuration(cycleTargetISO, fromDate)

  // From 10:00Z to next day 08:00Z = 22h = 79200000ms
  const expectedMs = (2026 - 2026) * 0 + 22 * 60 * 60 * 1000  // 22h

  info(`getRemainingMs → ${remainMs}ms (expected 79200000ms / 22h)`)
  info(`getRemainingSeconds → ${remainSec}s`)
  info(`getRemainingDuration → ${JSON.stringify(remainDur)}`)

  if (remainMs === 79200000) {
    pass(`getRemainingMs=79200000ms (22h exactly) ✓`)
  } else {
    fail(`getRemainingMs=${remainMs} expected 79200000 (22h)`)
  }

  if (remainSec === 79200) {
    pass(`getRemainingSeconds=79200s (22h) ✓`)
  } else {
    fail(`getRemainingSeconds=${remainSec} expected 79200`)
  }

  if (!remainDur.isPast) {
    pass(`getRemainingDuration.isPast=false ✓`)
  } else {
    fail(`getRemainingDuration.isPast should be false (target is in future)`)
  }

  if (remainDur.days === 0) {
    pass(`getRemainingDuration.days=0 (< 1 day) ✓`)
  } else {
    fail(`getRemainingDuration.days=${remainDur.days} expected 0`)
  }

  if (remainDur.hours === 22) {
    pass(`getRemainingDuration.hours=22 ✓`)
  } else {
    fail(`getRemainingDuration.hours=${remainDur.hours} expected 22`)
  }

  if (remainDur.minutes === 0) {
    pass(`getRemainingDuration.minutes=0 ✓`)
  } else {
    fail(`getRemainingDuration.minutes=${remainDur.minutes} expected 0`)
  }

  if (remainDur.seconds === 0) {
    pass(`getRemainingDuration.seconds=0 ✓`)
  } else {
    fail(`getRemainingDuration.seconds=${remainDur.seconds} expected 0`)
  }

  // Past target
  const pastISO = '2020-01-01T00:00:00Z'
  const pastDur = getRemainingDuration(pastISO, fromDate)
  if (pastDur.isPast && pastDur.days === 0 && pastDur.hours === 0 && pastDur.totalMs < 0) {
    pass(`getRemainingDuration past target: isPast=true, all fields 0, totalMs<0 ✓`)
  } else {
    fail(`getRemainingDuration past: ${JSON.stringify(pastDur)}`)
  }

  // Partial duration: 1d 5h 30m 45s
  const partial = getRemainingDuration(
    new Date(fromDate.getTime() + (1 * 86400 + 5 * 3600 + 30 * 60 + 45) * 1000).toISOString(),
    fromDate,
  )
  if (partial.days === 1 && partial.hours === 5 && partial.minutes === 30 && partial.seconds === 45) {
    pass(`getRemainingDuration(1d 5h 30m 45s): days=1, hours=5, minutes=30, seconds=45 ✓`)
  } else {
    fail(`getRemainingDuration partial: ${JSON.stringify(partial)}`)
  }

  // ── 5. formatDuration ──────────────────────────────────────────────────────

  section('5. formatDuration() — human-readable strings')

  const cases: [number, string][] = [
    [0,                     '0s'],
    [-5000,                 '0s'],
    [45000,                 '45s'],
    [125000,                '2m 5s'],
    [3600000,               '1h'],
    [7325000,               '2h 2m'],
    [86400000,              '1d'],
    [90061000,              '1d 1h'],
    [3 * 86400000 + 2 * 3600000, '3d 2h'],
  ]

  for (const [ms, expected] of cases) {
    const result = formatDuration(ms)
    if (result === expected) {
      pass(`formatDuration(${ms}) = '${result}' ✓`)
    } else {
      fail(`formatDuration(${ms}) = '${result}', expected '${expected}'`)
    }
  }

  // ── 6. daysBetween ─────────────────────────────────────────────────────────

  section('6. daysBetween() — date arithmetic')

  const dayCases: [Date, Date, number][] = [
    [new Date('2026-06-18T00:00:00Z'), new Date('2026-06-19T00:00:00Z'), 1],
    [new Date('2026-06-18T00:00:00Z'), new Date('2026-06-25T00:00:00Z'), 7],
    [new Date('2026-06-18T00:00:00Z'), new Date('2026-06-18T00:00:00Z'), 0],
    [new Date('2026-06-25T00:00:00Z'), new Date('2026-06-18T00:00:00Z'), 7],  // order-independent
  ]

  for (const [a, b, expected] of dayCases) {
    const result = daysBetween(a, b)
    if (result === expected) {
      pass(`daysBetween(${a.toISOString()}, ${b.toISOString()}) = ${result} ✓`)
    } else {
      fail(`daysBetween = ${result}, expected ${expected}`)
    }
  }

  // ── 7. getBogotaNow / getBogotaISOString sanity ────────────────────────────

  section('7. getBogotaNow / getBogotaISOString — live sanity checks')

  const now      = getBogotaNow()
  const nowISO   = getBogotaISOString()
  const nowDate  = getBogotaDate()
  const nowHour  = getBogotaHour()

  info(`getBogotaNow().toISOString() = ${now.toISOString()}`)
  info(`getBogotaDate().localISOString = ${nowDate.localISOString}`)
  info(`getBogotaHour() = ${nowHour}`)

  if (now instanceof Date && !isNaN(now.getTime())) {
    pass(`getBogotaNow() returns a valid Date`)
  } else {
    fail(`getBogotaNow() returned invalid Date`)
  }

  if (typeof nowISO === 'string' && nowISO.endsWith('Z')) {
    pass(`getBogotaISOString() returns UTC ISO string`)
  } else {
    fail(`getBogotaISOString() = '${nowISO}' (should end with Z)`)
  }

  if (nowHour >= 0 && nowHour <= 23) {
    pass(`getBogotaHour() = ${nowHour} (in range 0–23)`)
  } else {
    fail(`getBogotaHour() = ${nowHour} (out of range)`)
  }

  // ── 8. Full nextRunAt + countdown for each scheduled automation ────────────

  section('8. Full nextRunAt + remainingDuration for registered automations')

  const now8  = new Date()
  const all   = getAllAutomations()

  for (const def of all) {
    const nextRunAt = computeNextRunAt(def, now8)
    if (nextRunAt === null) {
      info(`${def.id.padEnd(20)} nextRunAt=null (on-demand)`)
      continue
    }

    const dur = getRemainingDuration(nextRunAt, now8)
    const fmt = `${dur.days}d ${dur.hours}h ${dur.minutes}m ${dur.seconds}s`

    const nextD = getBogotaDate(new Date(nextRunAt))
    info(`${def.id.padEnd(20)} nextRunAt=${nextRunAt} → Bogota ${nextD.localISOString} → remaining=${fmt}`)

    if (nextD.hour === (def.scheduledHour ?? -1)) {
      pass(`${def.id}: nextRunAt hour in Bogota = ${nextD.hour} (matches scheduledHour) ✓`)
    }

    if (!dur.isPast) {
      pass(`${def.id}: remaining duration is in the future ✓`)
    } else {
      fail(`${def.id}: nextRunAt is in the PAST — scheduling bug`)
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  section('Sprint 1D.1 Validation — Result')

  if (process.exitCode === 1) {
    console.log(`\n${RED}${BOLD}FAILED — see errors above${RESET}\n`)
  } else {
    console.log(`\n${GREEN}${BOLD}PASSED — Scheduler hardened${RESET}\n`)
    console.log(`${DIM}Sprint 1D.1 deliverables:${RESET}`)
    console.log(`  ✓ lib/ops/time/types.ts     — BogotaDateComponents, RemainingDuration`)
    console.log(`  ✓ lib/ops/time/timezone.ts  — getBogotaNow/Date/Hour, getNextOccurrenceAtHour()`)
    console.log(`  ✓ lib/ops/time/countdown.ts — getRemainingMs/Seconds/Duration()`)
    console.log(`  ✓ lib/ops/time/index.ts     — unified public API`)
    console.log(`  ✓ computeNextRunAt() refactored — no manual UTC offsets`)
    console.log(`  ✓ getNextOccurrenceAtHour() noon-UTC algorithm validated`)
    console.log(`    across 7 boundary scenarios (5AM, 23:59, 00:01, 02:59, 03:00 exact, midnight, 2030)`)
    console.log(`\n${BOLD}${GREEN}SCHEDULER_HARDENED${RESET}\n`)
  }
}

main()
