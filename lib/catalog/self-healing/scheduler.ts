/**
 * lib/catalog/self-healing/scheduler.ts
 *
 * Tracks healing cycle scheduling — when the last cycle ran, how many cycles
 * have completed, and whether enough time has elapsed for the next cycle.
 *
 * File: data/catalog/live-truth/healing-schedule.json
 * SERVER-ONLY — uses Node.js fs.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import type { HealingSchedule } from './types'

// ── Config ────────────────────────────────────────────────────────────────────

/** Minimum time between healing cycles. 60 minutes by default. */
const MIN_CYCLE_INTERVAL_MS = 60 * 60 * 1_000

// ── Path ──────────────────────────────────────────────────────────────────────

const SCHEDULE_PATH = join(
  process.cwd(),
  'data', 'catalog', 'live-truth', 'healing-schedule.json',
)

// ── File I/O ──────────────────────────────────────────────────────────────────

function loadSchedule(): HealingSchedule {
  if (!existsSync(SCHEDULE_PATH)) {
    return { lastCycleAt: null, cycleCount: 0, nextAllowedAt: null }
  }
  try {
    return JSON.parse(readFileSync(SCHEDULE_PATH, 'utf8')) as HealingSchedule
  } catch {
    return { lastCycleAt: null, cycleCount: 0, nextAllowedAt: null }
  }
}

function saveSchedule(schedule: HealingSchedule): void {
  const dir = dirname(SCHEDULE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = SCHEDULE_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(schedule, null, 2), 'utf8')
  renameSync(tmp, SCHEDULE_PATH)
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the current healing schedule. */
export function getHealingSchedule(): HealingSchedule {
  return loadSchedule()
}

/**
 * Returns true if enough time has elapsed since the last cycle
 * (or if no cycle has ever run).
 */
export function isCycleAllowed(minIntervalMs = MIN_CYCLE_INTERVAL_MS): boolean {
  const schedule = loadSchedule()
  if (!schedule.lastCycleAt) return true
  const elapsed = Date.now() - new Date(schedule.lastCycleAt).getTime()
  return elapsed >= minIntervalMs
}

/**
 * Record the start of a new healing cycle.
 * Returns the updated schedule (including new cycle count).
 */
export function recordCycleStart(): HealingSchedule {
  const schedule = loadSchedule()
  const now      = new Date()
  const next     = new Date(now.getTime() + MIN_CYCLE_INTERVAL_MS)
  const updated: HealingSchedule = {
    lastCycleAt:   now.toISOString(),
    cycleCount:    schedule.cycleCount + 1,
    nextAllowedAt: next.toISOString(),
  }
  saveSchedule(updated)
  return updated
}

/** Returns the count of completed cycles. */
export function getCycleCount(): number {
  return loadSchedule().cycleCount
}
