/**
 * lib/ops/execution/index.ts
 *
 * Public re-exports for the GOODPRICE operational execution layer.
 *
 * Import from here — not from individual lib/ops/execution/* files.
 */

// Types
export type {
  ExecJobType,
  ExecJobStatus,
  ExecJobProgress,
  ExecJobResult,
  ExecJob,
  ExecPipelineDef,
  ExecPipelineRun,
  ExecLogEntry,
  ExecStore,
  ExecReport,
} from './types'

// Queue — job CRUD and state
export {
  readStore,
  createJob,
  getJob,
  updateJob,
  updateProgress,
  cancelJob,
  isJobCancelled,
  getActiveJobs,
  getJobsByStatus,
  getRecentJobs,
  isJobTypeRunning,
  savePipelineRun,
  getPipelineRun,
  getRecentPipelines,
} from './queue-engine'

// Mutex
export {
  acquireLock,
  releaseLock,
  isLocked,
  getActiveLocks,
  forceReleaseLock,
} from './mutex'

// Progress
export {
  createProgress,
  advanceProgress,
  computeEta,
  makeProgressUpdater,
} from './progress-engine'
export type { ProgressOutcome } from './progress-engine'

// Execution log
export {
  appendToLog,
  getRecentLog,
  getLogByType,
} from './execution-log'

// Job runner
export { runJob } from './job-runner'

// Pipeline engine
export {
  RECOVERY_PIPELINE,
  QUICK_PIPELINE,
  AUDIT_PIPELINE,
  ALL_PIPELINES,
  runPipeline,
} from './pipeline-engine'

// Recovery orchestrator
export {
  runRecoveryPipeline,
  isRecoveryRunning,
  getRecoveryStatus,
} from './recovery-orchestrator'
export type { RecoveryOptions } from './recovery-orchestrator'

// Scheduler
export {
  SCHEDULES,
  getJobStaleness,
  getSchedule,
} from './scheduler'
export type { ScheduleDefinition, JobStaleness } from './scheduler'

// Reports
export { getExecutionReport } from './reports'
