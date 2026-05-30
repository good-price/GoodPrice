/**
 * lib/ops/workspace/types.ts
 *
 * All types for the GOODPRICE Phase 36 Workspace Layer.
 *
 * The workspace layer adds UX chrome (sidebar, tabs, command palette,
 * live feed, pinned metrics) on top of the existing action/execution/ops systems.
 * It does NOT add new business logic — it surfaces existing data differently.
 */

// ── Workspace sections ─────────────────────────────────────────────────────────

export type WorkspaceSection =
  | 'overview'
  | 'catalog'
  | 'visibility'
  | 'recovery'
  | 'validation'
  | 'repair'
  | 'healing'
  | 'pricing'
  | 'colombia'
  | 'operations'
  | 'analytics'
  | 'logs'
  | 'settings'

export type SidebarGroup = 'overview' | 'pipeline' | 'commerce' | 'data' | 'system'

export interface SectionDef {
  id:          WorkspaceSection
  label:       string
  icon:        string
  description: string
  group:       SidebarGroup
  anchor:      string        // ID of the HTML element on the admin page
}

// ── Workspace tabs ─────────────────────────────────────────────────────────────

export interface WorkspaceTab {
  id:        string
  label:     string
  section:   WorkspaceSection
  anchor:    string
  pinned:    boolean
  createdAt: string  // ISO
}

// ── Live events ───────────────────────────────────────────────────────────────

export type LiveEventLevel = 'info' | 'success' | 'warning' | 'error'

export type LiveEventType =
  | 'action_executed'
  | 'override_applied'
  | 'quarantine_change'
  | 'suppression_triggered'
  | 'recovery_completed'
  | 'validation_failed'
  | 'truth_drift'
  | 'healing_cycle'
  | 'job_completed'
  | 'job_failed'
  | 'bulk_action'
  | 'pipeline_run'
  | 'repair_applied'

export interface LiveEvent {
  id:            string
  type:          LiveEventType
  title:         string
  detail:        string
  timestamp:     string           // ISO
  level:         LiveEventLevel
  productId?:    string
  productTitle?: string
  operator?:     string
  source:        'action' | 'execution' | 'automation'
}

// ── Execution jobs (workspace view of ExecJob) ────────────────────────────────

export type WorkspaceJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface WorkspaceJob {
  id:           string
  type:         string
  label:        string
  status:       WorkspaceJobStatus
  progress:     number            // 0–100
  operator:     string
  startedAt:    string | null
  completedAt:  string | null
  durationMs:   number | null
  summary:      string | null
  warnings:     string[]
  errors:       string[]
}

// ── Pinned metrics ─────────────────────────────────────────────────────────────

export type MetricColor = 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'gray'

export interface MetricDef {
  id:          string
  label:       string
  description: string
  category:    'visibility' | 'health' | 'pipeline' | 'trust' | 'pricing'
  unit?:       string
}

export interface PinnedMetricValue {
  id:          string
  label:       string
  value:       string | number
  unit?:       string
  color:       MetricColor
  trend:       'up' | 'down' | 'stable' | 'unknown'
  trendLabel?: string
}

// ── Command palette ────────────────────────────────────────────────────────────

export type CommandActionType = 'navigate' | 'api_call' | 'external'

export interface CommandDef {
  id:           string
  label:        string
  description?: string
  icon:         string
  group:        string
  shortcut?:    string
  actionType:   CommandActionType
  actionValue:  string          // section anchor, URL, or external URL
  tags:         string[]        // for search
}

// ── Workspace client state ────────────────────────────────────────────────────

export interface WorkspaceState {
  sidebarCollapsed: boolean
  activeSection:    WorkspaceSection
  openTabs:         WorkspaceTab[]
  activeTabId:      string | null
  pinnedMetricIds:  string[]
  commandHistory:   string[]   // last 20 commands
  version:          number
}

// ── OPS snapshot (polling / live API response) ────────────────────────────────

export interface OpsSnapshot {
  timestamp:   string
  healthScore: number         // 0–100 from stabilization report
  systemStatus: 'ok' | 'degraded' | 'critical'

  visibility: {
    active:      number
    warning:     number
    degraded:    number
    suppressed:  number
    total:       number
    visiblePct:  number
  }

  overrideCount:    number
  pendingQueueJobs: number
  activeJobCount:   number

  recentEvents:  LiveEvent[]
  activeJobs:    WorkspaceJob[]
}
