/**
 * lib/ops/activation/types.ts
 *
 * All types for the GOODPRICE Phase 37 Operational Activation System.
 *
 * This layer sits ABOVE the existing execution/trust/stabilization systems.
 * It provides recovery orchestration, before/after comparison, queue visibility,
 * and actionable recommendations — without adding new business systems.
 *
 * SERVER-SAFE type definitions (no runtime imports).
 */

// ── Visibility snapshot ───────────────────────────────────────────────────────

export interface VisibilitySnapshot {
  capturedAt:  string
  total:       number
  active:      number
  warning:     number
  degraded:    number
  suppressed:  number
  visiblePct:  number
  healthScore: number
}

// ── Recovery run ──────────────────────────────────────────────────────────────

export type RecoveryStage =
  | 'trust-recompute'
  | 'repair'
  | 'live-truth'
  | 'link-audit'
  | 'colombia-audit'
  | 'self-healing'

export type RecoveryStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface RecoveryStageInfo {
  stage:              RecoveryStage
  label:              string
  status:             RecoveryStageStatus
  startedAt:          string | null
  completedAt:        string | null
  durationMs:         number | null
  productsProcessed:  number
  productsRecovered:  number
  productsSuppressed: number
  summary:            string | null
  error:              string | null
}

export type RecoveryRunStatus = 'idle' | 'running' | 'completed' | 'failed'

export interface RecoveryRun {
  id:                     string
  status:                 RecoveryRunStatus
  operator:               string
  startedAt:              string
  completedAt:            string | null
  stages:                 RecoveryStageInfo[]
  before:                 VisibilitySnapshot | null
  after:                  VisibilitySnapshot | null
  pipelineRunId:          string | null
  totalProductsProcessed: number
  totalProductsRecovered: number
  totalProductsSuppressed: number
  error:                  string | null
}

// ── Visibility audit ──────────────────────────────────────────────────────────

export type VisibilityHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'critical'
  | 'over-suppressed'

export interface VisibilityAuditResult {
  computedAt:      string
  status:          VisibilityHealthStatus
  total:           number
  active:          number
  warning:         number
  degraded:        number
  suppressed:      number
  visiblePct:      number
  suppressedPct:   number
  activeRatio:     number
  alertSuppressed: boolean   // suppressed > 40%
  alertVisible:    boolean   // visible < 60%
  alerts:          string[]
}

// ── Truth queue ───────────────────────────────────────────────────────────────

export interface TruthQueueItem {
  productId:     string
  asin:          string
  priority:      number
  lastCheckedAt: string | null
  ageHours:      number
  reason:        string
}

export interface TruthQueueStatus {
  computedAt:    string
  pending:       number
  highPriority:  number
  stale:         number       // > 48h since last check
  backlog:       boolean      // pending > 20
  items:         TruthQueueItem[]
}

// ── PA-API readiness ──────────────────────────────────────────────────────────

export interface PaapiReadiness {
  computedAt:           string
  configured:           boolean
  staleImages:          number
  freshImages:          number
  totalImages:          number
  recoverableProducts:  number   // stale images that can be synced
  imageRecoveryPct:     number
  recommendation:       string | null
}

// ── TRM monitor ───────────────────────────────────────────────────────────────

export type TrmFreshnessLabel = 'fresh' | 'aging' | 'stale' | 'unknown'

export interface TrmMonitorStatus {
  computedAt:     string
  rate:           number
  source:         string
  fetchedAt:      string | null
  expiresAt:      string | null
  ageHours:       number
  isStale:        boolean
  isFallback:     boolean
  freshnessLabel: TrmFreshnessLabel
  alertStale:     boolean   // > 24h old
  alertFallback:  boolean   // using hardcoded fallback
}

// ── Execution insights ────────────────────────────────────────────────────────

export interface JobTypeInsight {
  type:          string
  label:         string
  totalRuns:     number
  completedRuns: number
  failedRuns:    number
  successRate:   number
  avgDurationMs: number
  lastRunAt:     string | null
  lastStatus:    string | null
}

export interface ExecutionInsights {
  computedAt:       string
  totalJobs:        number
  successRate:      number
  avgDurationMs:    number
  stalledQueues:    string[]
  failurePatterns:  string[]
  byType:           JobTypeInsight[]
  hasActiveJobs:    boolean
  activeJobCount:   number
  suppressionSpike: boolean
  bottleneck:       string | null
}

// ── Recommendations ───────────────────────────────────────────────────────────

export type RecommendationAction =
  | 'run-recovery-pipeline'
  | 'run-repair'
  | 'run-live-truth'
  | 'configure-paapi'
  | 'run-colombia-audit'
  | 'reduce-suppression'
  | 'update-trm'
  | 'validate-batch'
  | 'run-link-audit'
  | 'run-trust-recompute'

export type RecommendationPriority = 'immediate' | 'high' | 'medium' | 'low'

export interface ActivationRecommendation {
  id:          string
  action:      RecommendationAction
  priority:    RecommendationPriority
  title:       string
  description: string
  impact:      string
  endpoint?:   string
  method?:     'POST' | 'GET'
  body?:       Record<string, unknown>
  tags:        string[]
}

// ── Recovery metrics (before/after) ──────────────────────────────────────────

export interface RecoveryImpact {
  visibleDelta:    number   // positive = improvement
  suppressedDelta: number   // negative = improvement
  activeDelta:     number
  healthDelta:     number
  recoveredCount:  number
  repairedCount:   number
  successRate:     number
}

// ── Full activation report ────────────────────────────────────────────────────

export interface ActivationReport {
  generatedAt:      string
  currentRun:       RecoveryRun | null
  lastCompletedRun: RecoveryRun | null
  visibilityAudit:  VisibilityAuditResult
  truthQueue:       TruthQueueStatus
  paapiReadiness:   PaapiReadiness
  trmStatus:        TrmMonitorStatus
  insights:         ExecutionInsights
  recommendations:  ActivationRecommendation[]
  impact:           RecoveryImpact | null   // null if no completed run yet
}
