/**
 * lib/ops/event-bus.ts
 *
 * Lightweight append-only event emitter backed by a rolling JSON file.
 * Allows any subsystem to emit operational events without coupling to
 * a central coordinator.
 *
 * File: data/ops/events.json  (rolling, capped at MAX_EVENTS)
 *
 * SERVER-ONLY — uses Node.js fs.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { dirname } from 'path'
import type { ActivityEvent, ActivityEventType, ActivitySubsystem, EventSeverity } from './types'
import { dataPath } from '@/lib/data-path'

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_EVENTS = 500
const EVENTS_PATH = dataPath('data', 'ops', 'events.json')

// ── I/O helpers ───────────────────────────────────────────────────────────────

interface EventLog {
  updatedAt: string
  events:    ActivityEvent[]
}

function loadLog(): EventLog {
  if (!existsSync(EVENTS_PATH)) return { updatedAt: '', events: [] }
  try {
    return JSON.parse(readFileSync(EVENTS_PATH, 'utf8')) as EventLog
  } catch {
    return { updatedAt: '', events: [] }
  }
}

function saveLog(log: EventLog): void {
  const dir = dirname(EVENTS_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = EVENTS_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(log, null, 2), 'utf8')
  renameSync(tmp, EVENTS_PATH)
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Emit an operational event to the rolling ops log.
 * Never throws — all errors are silently swallowed (ops logging is best-effort).
 */
export function emit(event: Omit<ActivityEvent, 'id'>): void {
  try {
    const log  = loadLog()
    const full: ActivityEvent = { ...event, id: newId() }
    const trimmed = [...log.events, full].slice(-MAX_EVENTS)
    saveLog({ updatedAt: new Date().toISOString(), events: trimmed })
  } catch { /* best-effort */ }
}

/**
 * Convenience overload for the common case.
 */
export function emitEvent(
  type:        ActivityEventType,
  subsystem:   ActivitySubsystem,
  severity:    EventSeverity,
  title:       string,
  description: string,
  extras?:     Partial<Pick<ActivityEvent, 'productId' | 'asin' | 'data'>>,
): void {
  emit({
    type,
    subsystem,
    severity,
    title,
    description,
    ts: new Date().toISOString(),
    ...extras,
  })
}

/** Load all events from the rolling log (newest last). */
export function loadEmittedEvents(): ActivityEvent[] {
  return loadLog().events
}

/** Clear all emitted events (dev/testing only). */
export function clearEvents(): void {
  saveLog({ updatedAt: new Date().toISOString(), events: [] })
}
