/**
 * lib/ops/actions/audit-log.ts
 *
 * Persists an operational audit trail of all product actions taken by operators.
 *
 * Storage: data/ops/actions/audit-log.json
 * Max entries: 1000 (trimmed oldest-first)
 *
 * SERVER-ONLY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { dirname } from 'path'
import type { ActionAuditEntry, ActionAuditLog, ProductAction } from './types'
import { dataPath } from '@/lib/data-path'

// ── Path ───────────────────────────────────────────────────────────────────────

const LOG_PATH = dataPath('data', 'ops', 'actions', 'audit-log.json')
const MAX_ENTRIES = 1000

// ── Helpers ────────────────────────────────────────────────────────────────────

function ensureDir(): void {
  const dir = dirname(LOG_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function readLog(): ActionAuditLog {
  if (!existsSync(LOG_PATH)) return { updatedAt: '', entries: [] }
  try {
    return JSON.parse(readFileSync(LOG_PATH, 'utf8')) as ActionAuditLog
  } catch {
    return { updatedAt: '', entries: [] }
  }
}

function writeLog(log: ActionAuditLog): void {
  ensureDir()
  const tmp = LOG_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(log, null, 2), 'utf8')
  renameSync(tmp, LOG_PATH)
}

function generateId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Appends a new entry to the audit log.
 * Automatically trims to MAX_ENTRIES (oldest removed first).
 */
export function appendAuditEntry(
  productId:     string,
  asin:          string,
  title:         string,
  action:        ProductAction,
  operator:      string,
  reason:        string,
  previousState: string,
  nextState:     string,
  success:       boolean,
  error?:        string,
): ActionAuditEntry {
  const entry: ActionAuditEntry = {
    id:            generateId(),
    productId,
    asin,
    title,
    action,
    operator,
    reason,
    previousState,
    nextState,
    timestamp:     new Date().toISOString(),
    success,
    error,
  }

  const log = readLog()
  // Prepend new entry (newest first)
  log.entries = [entry, ...log.entries].slice(0, MAX_ENTRIES)
  log.updatedAt = entry.timestamp
  writeLog(log)

  return entry
}

/**
 * Returns the full audit log (newest first).
 */
export function loadAuditLog(): ActionAuditLog {
  return readLog()
}

/**
 * Returns audit entries for a specific product (newest first).
 */
export function getProductAuditHistory(productId: string): ActionAuditEntry[] {
  return readLog().entries.filter(e => e.productId === productId)
}

/**
 * Returns the most recent N entries across all products.
 */
export function getRecentAuditEntries(limit = 50): ActionAuditEntry[] {
  return readLog().entries.slice(0, limit)
}

/**
 * Returns audit entries for a specific operator.
 */
export function getOperatorAuditHistory(operator: string, limit = 100): ActionAuditEntry[] {
  return readLog().entries.filter(e => e.operator === operator).slice(0, limit)
}
