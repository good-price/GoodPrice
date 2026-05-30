/**
 * lib/ops/activation/index.ts
 *
 * Public API for the GOODPRICE Phase 37 Operational Activation System.
 * SERVER-ONLY — all exports are safe for server components and API routes only.
 */

export type {
  VisibilitySnapshot,
  RecoveryStage,
  RecoveryStageStatus,
  RecoveryStageInfo,
  RecoveryRunStatus,
  RecoveryRun,
  VisibilityHealthStatus,
  VisibilityAuditResult,
  TruthQueueItem,
  TruthQueueStatus,
  PaapiReadiness,
  TrmFreshnessLabel,
  TrmMonitorStatus,
  JobTypeInsight,
  ExecutionInsights,
  RecommendationAction,
  RecommendationPriority,
  ActivationRecommendation,
  RecoveryImpact,
  ActivationReport,
} from './types'

export { computeVisibilityAudit }         from './visibility-audit'
export { getTruthQueueStatus }            from './truth-queue'
export { getPaapiReadiness }              from './paapi-readiness'
export { getTrmMonitorStatus }            from './trm-monitor'
export { buildExecutionInsights }         from './execution-insights'
export { buildActivationRecommendations } from './recommendations'
export { captureVisibilitySnapshot, computeRecoveryImpact } from './recovery-metrics'
export {
  runCatalogRecovery,
  loadRecoveryRun,
  saveRecoveryRun,
  getLastCompletedRun,
  getActiveRecoveryRun,
} from './catalog-recovery'
export { buildActivationReport } from './reports'
