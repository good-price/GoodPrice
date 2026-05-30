/**
 * lib/ops/types.ts
 *
 * Types for the GOODPRICE Internal Operations Center (Phase 31).
 * All types are designed for server-side-only usage (no client bundle concerns).
 */

// ── Activity feed ──────────────────────────────────────────────────────────────

export type ActivityEventType =
  | 'product_suppressed'
  | 'product_recovered'
  | 'drift_repair'
  | 'price_override'
  | 'product_quarantined'
  | 'replacement_suggested'
  | 'healing_cycle'
  | 'validation_run'
  | 'validation_failure'
  | 'link_audit_run'
  | 'colombia_audit_run'
  | 'repair_run'
  | 'ranking_change'
  | 'currency_updated'
  | 'custom'

export type ActivitySubsystem =
  | 'live-truth'
  | 'self-healing'
  | 'quarantine'
  | 'intelligence'
  | 'watchlist'
  | 'pricing'
  | 'link-health'
  | 'colombia'
  | 'repair'
  | 'ops'

export type EventSeverity = 'info' | 'warning' | 'critical'

export interface ActivityEvent {
  id:          string
  type:        ActivityEventType
  subsystem:   ActivitySubsystem
  severity:    EventSeverity
  title:       string
  description: string
  productId?:  string
  asin?:       string
  /** Optional machine-readable payload for detail panels. */
  data?:       Record<string, unknown>
  ts:          string   // ISO timestamp
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export interface SystemAlert {
  id:          string
  severity:    EventSeverity
  subsystem:   string
  title:       string
  description: string
  /** Suggested resolution or next action. */
  suggestion?: string
  triggeredAt: string
}

// ── Anomalies ─────────────────────────────────────────────────────────────────

export interface Anomaly {
  type:        string
  severity:    'warning' | 'critical'
  description: string
  /** Current observed value (e.g. suppressions per hour). */
  value:       number
  /** Threshold that was exceeded. */
  threshold:   number
  detectedAt:  string
}

// ── Queue status ──────────────────────────────────────────────────────────────

export interface QueueStatus {
  name:           string
  size:           number
  /** ISO timestamp of the oldest enqueued item, or null if empty. */
  oldestItemAt:   string | null
  /** True if the queue hasn't been processed in > staleness threshold. */
  isStalled:      boolean
  /** ISO timestamp of last queue activity (build or dequeue). */
  lastActivityAt: string | null
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

export interface DiagnosticIssue {
  severity:   EventSeverity
  subsystem:  string
  code:       string
  description: string
  suggestion: string
}

// ── Platform health score ──────────────────────────────────────────────────────
// Note: separate from the existing SubsystemHealth in lib/ops/health.ts.
// This is a dimensional 0-100 score covering cross-cutting concerns.

export interface PlatformHealthScore {
  /** Weighted composite score. */
  overall:           number
  truthHealth:       number   // avg truth score coverage
  catalogHealth:     number   // public / total ratio
  suppressionHealth: number   // 1 - suppression ratio
  queueHealth:       number   // queue freshness
  freshnessHealth:   number   // % checked recently
  availabilityHealth: number  // Colombia + link health
  computedAt:        string
}

// ── Quick actions ─────────────────────────────────────────────────────────────

export type ActionCategory = 'validation' | 'healing' | 'audit' | 'infrastructure'

export interface QuickAction {
  id:          string
  label:       string
  description: string
  /** API endpoint to call. */
  endpoint:    string
  method:      'POST' | 'GET'
  /** Default request body (JSON). */
  body?:       Record<string, unknown>
  category:    ActionCategory
  /** Estimated duration hint for the admin UI. */
  durationHint?: string
}

export interface ActionResult {
  ok:         boolean
  actionId:   string
  durationMs: number
  message:    string
  data?:      Record<string, unknown>
}

// ── Ops report ────────────────────────────────────────────────────────────────

export interface OpsReport {
  generatedAt:    string
  health:         PlatformHealthScore
  alerts:         SystemAlert[]
  anomalies:      Anomaly[]
  queues:         QueueStatus[]
  diagnostics:    DiagnosticIssue[]
  recentActivity: ActivityEvent[]
}
