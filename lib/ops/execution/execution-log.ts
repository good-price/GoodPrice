/**
 * lib/ops/execution/execution-log.ts
 *
 * Persistent append-only execution log.
 *
 * Stores the last MAX_ENTRIES entries in data/ops/execution/execution-log.json.
 * Used by the admin dashboard to show historical job outcomes.
 *
 * SERVER-ONLY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import type { ExecLogEntry, ExecJob } from './types'

// ── Config ────────────────────────────────────────────────────────────────────

const LOG_PATH   = join(process.cwd(), 'data', 'ops', 'execution', 'execution-log.json')
const MAX_ENTRIES = 200

// ── I/O ───────────────────────────────────────────────────────────────────────

interface LogFile {
  updatedAt: string
  entries:   ExecLogEntry[]
}

function ensureDir(): void {
  const dir = dirname(LOG_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function readLog(): LogFile {
  ensureDir()
  if (!existsSync(LOG_PATH)) {
    return { updatedAt: new Date().toISOString(), entries: [] }
  }
  try {
    return JSON.parse(readFileSync(LOG_PATH, 'utf8')) as LogFile
  } catch {
    return { updatedAt: new Date().toISOString(), entries: [] }
  }
}

function writeLog(log: LogFile): void {
  ensureDir()
  log.updatedAt = new Date().toISOString()
  // Keep newest entries
  log.entries = log.entries.slice(0, MAX_ENTRIES)
  const tmp = LOG_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(log, null, 2), 'utf8')
  renameSync(tmp, LOG_PATH)
}

// ── Subsystem map ─────────────────────────────────────────────────────────────

const SUBSYSTEM_MAP: Record<string, string> = {
  'trust-recompute': 'trust-engine',
  'repair':          'repair-pipeline',
  'live-truth':      'live-truth',
  'link-audit':      'link-health',
  'colombia-audit':  'colombia-availability',
  'self-healing':    'self-healing',
  'paapi-sync':      'paapi',
  'recovery-pipeline': 'recovery-orchestrator',
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Appends a completed job to the execution log.
 */
export function appendToLog(job: ExecJob): void {
  const log   = readLog()
  const entry: ExecLogEntry = {
    id:          `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    jobId:       job.id,
    jobType:     job.type,
    status:      job.status,
    startedAt:   job.startedAt ?? job.createdAt,
    completedAt: job.completedAt,
    operator:    job.operator,
    subsystem:   SUBSYSTEM_MAP[job.type] ?? job.type,
    affected:    job.result?.affected ?? 0,
    warnings:    job.result?.warnings ?? [],
    errors:      job.result?.errors   ?? (job.error ? [job.error] : []),
    summary:     job.result?.summary ?? job.error ?? null,
  }

  // Prepend (newest first)
  log.entries.unshift(entry)
  writeLog(log)
}

/**
 * Returns the most recent log entries.
 */
export function getRecentLog(limit = 50): ExecLogEntry[] {
  return readLog().entries.slice(0, limit)
}

/**
 * Returns all log entries for a specific job type.
 */
export function getLogByType(jobType: string, limit = 20): ExecLogEntry[] {
  return readLog().entries
    .filter(e => e.jobType === jobType)
    .slice(0, limit)
}
