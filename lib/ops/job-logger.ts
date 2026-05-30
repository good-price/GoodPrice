/**
 * Job Execution Logger — persistent history of cron/scheduled job runs.
 *
 * Stores the last N executions per job in data/ops/jobs.json.
 * Provides the foundation for:
 *   - "When did the last audit run?"
 *   - "Did the price-check job fail last night?"
 *   - Health checks (staleness detection)
 *   - Admin dashboard job history
 *
 * Design:
 *   - Single JSON file — simple, no dependencies
 *   - Ring buffer per job (max MAX_PER_JOB entries)
 *   - Synchronous read, synchronous write
 *   - Safe for single-process Vercel lambdas (no concurrent writes)
 *
 * Job IDs (well-known):
 *   'price-check'    — /api/pricing/check (hourly)
 *   'alert-detect'   — /api/alerts/detect (hourly)
 *   'audit'          — /api/audit/run (monthly)
 *   'paapi-sync'     — /api/paapi/sync (weekly)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { logger } from './logger'

// ── Config ─────────────────────────────────────────────────────────────────────

const OPS_DIR      = join(process.cwd(), 'data', 'ops')
const JOBS_FILE    = join(OPS_DIR, 'jobs.json')
const MAX_PER_JOB  = 20   // keep last 20 executions per job

// ── Types ──────────────────────────────────────────────────────────────────────

export type JobStatus = 'running' | 'success' | 'failed' | 'partial'

export interface JobExecution {
  /** Unique run identifier — use Date.now() or a UUID */
  runId:       string
  /** Job display name (e.g. 'price-check') */
  jobId:       string
  startedAt:   string   // ISO
  completedAt?: string  // ISO — undefined if still running
  durationMs?:  number
  status:       JobStatus
  /** Short human-readable result (e.g. "200 checked, 3 errors") */
  summary?:     string
  error?:       string  // last error message if status=failed
  /** Arbitrary extra context */
  meta?:        Record<string, unknown>
}

interface JobStore {
  updatedAt: string
  /** jobId → ring buffer of executions (newest first) */
  jobs: Record<string, JobExecution[]>
}

// ── Store I/O ──────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(OPS_DIR)) mkdirSync(OPS_DIR, { recursive: true })
}

function readStore(): JobStore {
  if (!existsSync(JOBS_FILE)) return { updatedAt: new Date().toISOString(), jobs: {} }
  try {
    return JSON.parse(readFileSync(JOBS_FILE, 'utf-8')) as JobStore
  } catch {
    return { updatedAt: new Date().toISOString(), jobs: {} }
  }
}

function writeStore(store: JobStore): void {
  ensureDir()
  store.updatedAt = new Date().toISOString()
  writeFileSync(JOBS_FILE, JSON.stringify(store, null, 2), 'utf-8')
}

function upsertExecution(store: JobStore, execution: JobExecution): void {
  const list = store.jobs[execution.jobId] ?? []
  const idx  = list.findIndex(e => e.runId === execution.runId)

  if (idx >= 0) {
    list[idx] = execution  // update in-place (e.g. running → success)
  } else {
    list.unshift(execution)  // prepend (newest first)
  }

  // Trim ring buffer
  store.jobs[execution.jobId] = list.slice(0, MAX_PER_JOB)
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Record the start of a job run. Returns the generated runId.
 * Call `completeJob` or `failJob` when done.
 */
export function startJob(jobId: string, meta?: Record<string, unknown>): string {
  const runId = `${jobId}-${Date.now()}`
  const store = readStore()
  upsertExecution(store, {
    runId,
    jobId,
    startedAt: new Date().toISOString(),
    status: 'running',
    meta,
  })
  writeStore(store)
  logger.info('Job started', { job: jobId, runId })
  return runId
}

/**
 * Mark a job run as successful.
 */
export function completeJob(
  jobId: string,
  runId: string,
  options?: { summary?: string; status?: Exclude<JobStatus, 'failed' | 'running'>; meta?: Record<string, unknown> },
): void {
  const store       = readStore()
  const existing    = store.jobs[jobId]?.find(e => e.runId === runId)
  const startedAt   = existing?.startedAt ?? new Date().toISOString()
  const completedAt = new Date().toISOString()

  upsertExecution(store, {
    runId,
    jobId,
    startedAt,
    completedAt,
    durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    status: options?.status ?? 'success',
    summary: options?.summary,
    meta: { ...existing?.meta, ...options?.meta },
  })
  writeStore(store)

  logger.info('Job completed', {
    job:     jobId,
    runId,
    status:  options?.status ?? 'success',
    summary: options?.summary,
  })
}

/**
 * Mark a job run as failed.
 */
export function failJob(
  jobId: string,
  runId: string,
  error: Error | string,
  options?: { summary?: string; meta?: Record<string, unknown> },
): void {
  const store       = readStore()
  const existing    = store.jobs[jobId]?.find(e => e.runId === runId)
  const startedAt   = existing?.startedAt ?? new Date().toISOString()
  const completedAt = new Date().toISOString()
  const errMsg      = typeof error === 'string' ? error : error.message

  upsertExecution(store, {
    runId,
    jobId,
    startedAt,
    completedAt,
    durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    status: 'failed',
    error: errMsg.slice(0, 300),
    summary: options?.summary,
    meta: { ...existing?.meta, ...options?.meta },
  })
  writeStore(store)

  logger.error('Job failed', { job: jobId, runId, error: errMsg.slice(0, 120) })
}

/**
 * Get the most recent execution of a specific job.
 * Returns null if no executions recorded.
 */
export function getLastExecution(jobId: string): JobExecution | null {
  const store = readStore()
  return store.jobs[jobId]?.[0] ?? null
}

/**
 * Get execution history for a job (newest first).
 */
export function getJobHistory(jobId: string, limit = MAX_PER_JOB): JobExecution[] {
  const store = readStore()
  return (store.jobs[jobId] ?? []).slice(0, limit)
}

/**
 * Get the most recent execution for every tracked job.
 * Useful for the admin dashboard overview.
 */
export function getAllLastExecutions(): Record<string, JobExecution | null> {
  const store = readStore()
  const result: Record<string, JobExecution | null> = {}
  for (const [jobId, list] of Object.entries(store.jobs)) {
    result[jobId] = list[0] ?? null
  }
  return result
}

/**
 * Returns age of last execution in milliseconds.
 * Returns Infinity if no execution recorded.
 */
export function jobAgeMs(jobId: string): number {
  const last = getLastExecution(jobId)
  if (!last?.completedAt) return Infinity
  return Date.now() - new Date(last.completedAt).getTime()
}
