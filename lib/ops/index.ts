/**
 * GOODPRICE Ops — Public API
 * Import from here — not from individual lib/ops/* files.
 *
 * Usage:
 *   import { logger, startJob, completeJob, runHealthCheck, withRetry } from '@/lib/ops'
 */

export { logger, jobLogger } from './logger'
export type { LogLevel, LogContext } from './logger'

export { withRetry, skipClientErrors } from './retry'
export type { RetryOptions } from './retry'

export {
  startJob,
  completeJob,
  failJob,
  getLastExecution,
  getJobHistory,
  getAllLastExecutions,
  jobAgeMs,
} from './job-logger'
export type { JobStatus, JobExecution } from './job-logger'

export { runHealthCheck } from './health'
export type { HealthStatus, SubsystemHealth, SystemHealth } from './health'

// ── Phase 31 — Operations Center ──────────────────────────────────────────────
export type {
  ActivityEventType, ActivitySubsystem, EventSeverity,
  ActivityEvent, SystemAlert, Anomaly, QueueStatus,
  DiagnosticIssue, PlatformHealthScore, QuickAction, ActionResult, OpsReport,
} from './types'

export { emit, emitEvent, loadEmittedEvents, clearEvents } from './event-bus'
export { buildActivityLog }           from './activity-log'
export { generateAlerts }             from './alert-engine'
export { detectAnomalies }            from './anomaly-engine'
export { computePlatformHealthScore } from './system-health'
export { getQueueStatuses }           from './queue-monitor'
export { runDiagnostics }             from './diagnostics'
export { buildTimeline }              from './timeline'
export type { TimelineOptions }       from './timeline'
export { getAvailableActions, executeAction } from './action-center'
export { buildOpsReport, loadOpsReport, saveOpsReport } from './reports'
