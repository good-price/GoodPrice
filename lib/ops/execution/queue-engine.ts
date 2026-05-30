/**
 * lib/ops/execution/queue-engine.ts
 *
 * File-backed job store — CRUD for execution jobs and pipeline runs.
 *
 * All reads/writes go through data/ops/execution/store.json.
 * Atomic write via tmp-file rename to prevent corruption.
 *
 * SERVER-ONLY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import type { ExecJob, ExecJobType, ExecJobStatus, ExecJobProgress, ExecPipelineRun, ExecStore } from './types'

// ── Config ────────────────────────────────────────────────────────────────────

const STORE_PATH = join(process.cwd(), 'data', 'ops', 'execution', 'store.json')
const MAX_JOBS   = 50
const MAX_PIPES  = 10

// ── Store I/O ─────────────────────────────────────────────────────────────────

function ensureDir(): void {
  const dir = dirname(STORE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function readStore(): ExecStore {
  ensureDir()
  if (!existsSync(STORE_PATH)) {
    return { updatedAt: new Date().toISOString(), jobs: {}, pipelines: {} }
  }
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as ExecStore
  } catch {
    return { updatedAt: new Date().toISOString(), jobs: {}, pipelines: {} }
  }
}

export function writeStore(store: ExecStore): void {
  ensureDir()
  store.updatedAt = new Date().toISOString()

  // Trim to max entries (keep newest by createdAt)
  const jobs = Object.values(store.jobs)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_JOBS)
  store.jobs = Object.fromEntries(jobs.map(j => [j.id, j]))

  const pipes = Object.values(store.pipelines)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, MAX_PIPES)
  store.pipelines = Object.fromEntries(pipes.map(p => [p.id, p]))

  const tmp = STORE_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, STORE_PATH)
}

// ── Job CRUD ──────────────────────────────────────────────────────────────────

function makeId(type: ExecJobType): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function emptyProgress(): ExecJobProgress {
  return {
    total: 0, processed: 0, repaired: 0, suppressed: 0,
    recovered: 0, failed: 0, durationMs: 0, etaMs: null,
  }
}

export function createJob(
  type:     ExecJobType,
  options:  Record<string, unknown>,
  operator: string,
): ExecJob {
  const job: ExecJob = {
    id:          makeId(type),
    type,
    status:      'queued',
    progress:    emptyProgress(),
    options,
    startedAt:   null,
    completedAt: null,
    createdAt:   new Date().toISOString(),
    operator,
    result:      null,
    error:       null,
  }
  const store = readStore()
  store.jobs[job.id] = job
  writeStore(store)
  return job
}

export function getJob(jobId: string): ExecJob | null {
  return readStore().jobs[jobId] ?? null
}

export function updateJob(jobId: string, patch: Partial<ExecJob>): void {
  const store = readStore()
  const job   = store.jobs[jobId]
  if (!job) return
  store.jobs[jobId] = { ...job, ...patch }
  writeStore(store)
}

export function updateProgress(jobId: string, progress: Partial<ExecJobProgress>): void {
  const store = readStore()
  const job   = store.jobs[jobId]
  if (!job) return
  store.jobs[jobId] = { ...job, progress: { ...job.progress, ...progress } }
  writeStore(store)
}

/**
 * Marks a job as cancelled. Returns true if the job was cancellable.
 */
export function cancelJob(jobId: string): boolean {
  const store = readStore()
  const job   = store.jobs[jobId]
  if (!job) return false
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return false
  }
  store.jobs[jobId] = {
    ...job,
    status:      'cancelled',
    completedAt: new Date().toISOString(),
  }
  writeStore(store)
  return true
}

/** Returns true if a cancellation was requested for this job. */
export function isJobCancelled(jobId: string): boolean {
  return getJob(jobId)?.status === 'cancelled'
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getActiveJobs(): ExecJob[] {
  const store = readStore()
  return Object.values(store.jobs).filter(
    j => j.status === 'queued' || j.status === 'running',
  )
}

export function getJobsByStatus(status: ExecJobStatus): ExecJob[] {
  return Object.values(readStore().jobs).filter(j => j.status === status)
}

export function getRecentJobs(limit = 20): ExecJob[] {
  return Object.values(readStore().jobs)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

export function isJobTypeRunning(type: ExecJobType): boolean {
  return Object.values(readStore().jobs).some(
    j => j.type === type && (j.status === 'queued' || j.status === 'running'),
  )
}

// ── Pipeline CRUD ─────────────────────────────────────────────────────────────

export function savePipelineRun(run: ExecPipelineRun): void {
  const store = readStore()
  store.pipelines[run.id] = run
  writeStore(store)
}

export function getPipelineRun(id: string): ExecPipelineRun | null {
  return readStore().pipelines[id] ?? null
}

export function getRecentPipelines(limit = 5): ExecPipelineRun[] {
  return Object.values(readStore().pipelines)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)
}
