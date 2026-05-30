/**
 * lib/ops/workspace/execution-stream.ts
 *
 * Converts the existing ExecJob / ExecLogEntry types from
 * lib/ops/execution into the workspace-level WorkspaceJob format.
 *
 * SERVER-ONLY — reads from existing execution engine.
 */

import { getActiveJobs, getRecentJobs } from '@/lib/ops/execution/queue-engine'
import type { ExecJob }                 from '@/lib/ops/execution/types'
import type { WorkspaceJob }            from './types'

// ── Job type labels ───────────────────────────────────────────────────────────

const JOB_LABELS: Record<string, string> = {
  'trust-recompute':   'Recompute Trust Tiers',
  'repair':            'Repair Pipeline',
  'live-truth':        'Live Truth Validation',
  'link-audit':        'Link Health Audit',
  'colombia-audit':    'Colombia Availability Audit',
  'self-healing':      'Self-Healing Cycle',
  'paapi-sync':        'PA-API Image Sync',
  'recovery-pipeline': 'Recovery Pipeline',
}

// ── Converters ────────────────────────────────────────────────────────────────

function toWorkspaceJob(job: ExecJob): WorkspaceJob {
  const startMs   = job.startedAt   ? new Date(job.startedAt).getTime()   : null
  const endMs     = job.completedAt ? new Date(job.completedAt).getTime() : null
  const durationMs = startMs && endMs ? endMs - startMs : null

  // Compute progress percentage from job progress object
  const p = job.progress
  const progressPct = p.total > 0
    ? Math.min(100, Math.round((p.processed / p.total) * 100))
    : job.status === 'completed' ? 100
    : job.status === 'running'   ? 50    // unknown progress → show 50% spinner
    : 0

  return {
    id:          job.id,
    type:        job.type,
    label:       JOB_LABELS[job.type] ?? job.type,
    status:      job.status as WorkspaceJob['status'],
    progress:    progressPct,
    operator:    job.operator,
    startedAt:   job.startedAt,
    completedAt: job.completedAt,
    durationMs,
    summary:     job.result?.summary ?? job.error ?? null,
    warnings:    job.result?.warnings ?? [],
    errors:      job.result?.errors ?? (job.error ? [job.error] : []),
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns currently active (queued/running) jobs in workspace format.
 */
export function getWorkspaceActiveJobs(): WorkspaceJob[] {
  try {
    return getActiveJobs().map(toWorkspaceJob)
  } catch {
    return []
  }
}

/**
 * Returns recent jobs (all statuses) in workspace format.
 */
export function getWorkspaceRecentJobs(limit = 10): WorkspaceJob[] {
  try {
    return getRecentJobs(limit).map(toWorkspaceJob)
  } catch {
    return []
  }
}

/**
 * Returns count of currently running or queued jobs.
 */
export function getActiveJobCount(): number {
  try {
    return getActiveJobs().length
  } catch {
    return 0
  }
}
