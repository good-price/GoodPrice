/**
 * lib/ops/execution/types.ts
 *
 * Core types for the GOODPRICE operational execution layer (Phase 33).
 * All execution metadata is file-backed — no external DB required.
 */

// ── Job ───────────────────────────────────────────────────────────────────────

export type ExecJobType =
  | 'trust-recompute'
  | 'repair'
  | 'live-truth'
  | 'link-audit'
  | 'colombia-audit'
  | 'self-healing'
  | 'paapi-sync'
  | 'recovery-pipeline'

export type ExecJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface ExecJobProgress {
  /** Total products to process (0 = unknown). */
  total:      number
  processed:  number
  repaired:   number
  suppressed: number
  recovered:  number
  failed:     number
  /** Wall-clock ms since job started. */
  durationMs: number
  /** Estimated ms remaining, or null if unknown. */
  etaMs:      number | null
  /** ASIN or product ID currently being processed. */
  currentProduct?: string
}

export interface ExecJobResult {
  summary:  string
  affected: number
  warnings: string[]
  errors:   string[]
  /** Subsystem-specific data (varies by job type). */
  data?:    Record<string, unknown>
}

export interface ExecJob {
  id:          string
  type:        ExecJobType
  status:      ExecJobStatus
  progress:    ExecJobProgress
  /** Options passed at enqueue time. */
  options:     Record<string, unknown>
  startedAt:   string | null   // ISO
  completedAt: string | null   // ISO
  createdAt:   string          // ISO
  operator:    string
  result:      ExecJobResult | null
  error:       string | null
  /** Set when this job belongs to a pipeline. */
  pipelineId?:    string
  pipelineStage?: number
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export interface ExecPipelineDef {
  id:          string
  name:        string
  description: string
  stages:      ExecJobType[]
}

export interface ExecPipelineRun {
  id:           string
  pipelineId:   string
  name:         string
  status:       ExecJobStatus
  currentStage: number
  totalStages:  number
  /** Ordered list of job IDs (one per stage). */
  jobIds:       string[]
  startedAt:    string
  completedAt:  string | null
  operator:     string
}

// ── Execution log ─────────────────────────────────────────────────────────────

export interface ExecLogEntry {
  id:          string
  jobId:       string
  jobType:     ExecJobType
  status:      ExecJobStatus
  startedAt:   string
  completedAt: string | null
  operator:    string
  subsystem:   string
  affected:    number
  warnings:    string[]
  errors:      string[]
  summary:     string | null
}

// ── Persistent store ──────────────────────────────────────────────────────────

export interface ExecStore {
  updatedAt: string
  /** jobId → ExecJob (last 50 jobs). */
  jobs:      Record<string, ExecJob>
  /** pipelineRunId → ExecPipelineRun (last 10 pipeline runs). */
  pipelines: Record<string, ExecPipelineRun>
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface ExecReport {
  generatedAt:    string
  totalRuns:      number
  completedRuns:  number
  failedRuns:     number
  cancelledRuns:  number
  avgDurationMs:  number
  activeJobs:     ExecJob[]
  recentJobs:     ExecJob[]
  recentPipelines: ExecPipelineRun[]
}
