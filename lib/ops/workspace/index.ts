/**
 * lib/ops/workspace/index.ts
 *
 * Public re-exports for the GOODPRICE Phase 36 Workspace Layer.
 * Import from here — not from individual workspace/* files.
 */

// Types
export type {
  WorkspaceSection,
  SidebarGroup,
  SectionDef,
  WorkspaceTab,
  LiveEventLevel,
  LiveEventType,
  LiveEvent,
  WorkspaceJobStatus,
  WorkspaceJob,
  MetricColor,
  MetricDef,
  PinnedMetricValue,
  CommandActionType,
  CommandDef,
  WorkspaceState,
  OpsSnapshot,
} from './types'

// Navigation
export {
  SECTION_DEFS,
  GROUP_LABELS,
  SIDEBAR_GROUPS,
  getSectionDef,
  getSectionsByGroup,
} from './navigation'

// Live events
export {
  getWorkspaceLiveEvents,
  getEventsSince,
} from './live-events'

// Execution stream
export {
  getWorkspaceActiveJobs,
  getWorkspaceRecentJobs,
  getActiveJobCount,
} from './execution-stream'

// Realtime engine + reports
export {
  buildOpsSnapshot,
  buildSectionCounts,
} from './realtime-engine'

// Workspace state helpers
export {
  WORKSPACE_STORAGE_KEY,
  WORKSPACE_VERSION,
  DEFAULT_WORKSPACE_STATE,
  loadWorkspaceState,
  saveWorkspaceState,
  makeTab,
  makeTabId,
  addToCommandHistory,
} from './workspace-state'

// Pinned metrics
export {
  METRIC_DEFS,
  computeMetricValues,
  getPinnedMetricValues,
} from './pinned-views'

// Command palette
export {
  COMMAND_DEFS,
  searchCommands,
  groupCommands,
} from './command-palette'

// Layout helpers
export {
  SECTION_ANCHOR_PREFIX,
  SECTION_ANCHORS,
  SIDEBAR_WIDTH_EXPANDED,
  SIDEBAR_WIDTH_COLLAPSED,
  TOPBAR_HEIGHT,
  scrollToSection,
  anchorToSection,
  sectionToAnchor,
} from './workspace-layout'
