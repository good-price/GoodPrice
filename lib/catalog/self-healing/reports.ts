/**
 * lib/catalog/self-healing/reports.ts
 *
 * File persistence for the self-healing system.
 *
 * Files:
 *   data/catalog/live-truth/healing-report.json  — latest SelfHealingReport
 *   data/catalog/live-truth/healing-log.json     — rolling HealingEvent log
 *
 * All writes are atomic (.tmp → rename).
 * SERVER-ONLY — uses Node.js fs.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import type { SelfHealingReport, HealingEvent } from './types'
import { dataPath } from '@/lib/data-path'

// ── Paths ─────────────────────────────────────────────────────────────────────

const BASE_DIR   = dataPath('data', 'catalog', 'live-truth')
const REPORT_PATH = join(BASE_DIR, 'healing-report.json')
const LOG_PATH    = join(BASE_DIR, 'healing-log.json')

/** Maximum healing events retained in the rolling log. */
const MAX_LOG_ENTRIES = 200

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(filePath: string): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function atomicWrite(filePath: string, data: unknown): void {
  ensureDir(filePath)
  const tmp = filePath + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, filePath)
}

// ── Report ────────────────────────────────────────────────────────────────────

/** Load the latest self-healing report, or null if none exists. */
export function loadHealingReport(): SelfHealingReport | null {
  if (!existsSync(REPORT_PATH)) return null
  try {
    return JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as SelfHealingReport
  } catch {
    return null
  }
}

/** Persist the latest self-healing report. */
export function saveHealingReport(report: SelfHealingReport): void {
  atomicWrite(REPORT_PATH, report)
}

// ── Rolling event log ─────────────────────────────────────────────────────────

interface EventLog {
  updatedAt: string
  events:    HealingEvent[]
}

function loadEventLog(): EventLog {
  if (!existsSync(LOG_PATH)) return { updatedAt: '', events: [] }
  try {
    return JSON.parse(readFileSync(LOG_PATH, 'utf8')) as EventLog
  } catch {
    return { updatedAt: '', events: [] }
  }
}

/**
 * Append new events to the rolling log, capped at MAX_LOG_ENTRIES.
 * Newest events at the end.
 */
export function appendHealingEvents(newEvents: HealingEvent[]): void {
  if (newEvents.length === 0) return
  const log = loadEventLog()
  const combined = [...log.events, ...newEvents]
  const trimmed  = combined.slice(-MAX_LOG_ENTRIES)
  atomicWrite(LOG_PATH, { updatedAt: new Date().toISOString(), events: trimmed })
}

/** Load the full rolling event log. */
export function loadHealingEvents(): HealingEvent[] {
  return loadEventLog().events
}

/** Count all-time recovered events from the log. */
export function countRecoveredAllTime(): number {
  return loadEventLog().events.filter(e => e.action === 'recover').length
}

/** Count all-time drift repairs from the log. */
export function countDriftRepairsAllTime(): number {
  return loadEventLog().events.filter(e => e.action === 'drift_repair').length
}
