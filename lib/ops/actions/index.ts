/**
 * lib/ops/actions/index.ts
 *
 * Public re-exports for the GOODPRICE Phase 35 Action Layer.
 */

// Types
export type {
  ProductAction,
  TierOverrideAction,
  OverrideTier,
  ProductOverride,
  OverrideStore,
  RiskLevel,
  ModerationNote,
  ModerationEntry,
  ModerationStore,
  ActionAuditEntry,
  ActionAuditLog,
  ActionResult,
  BulkActionResult,
  CatalogTableRow,
  ProductHistoryEntry,
} from './types'

// Override engine
export {
  setOverride,
  removeOverride,
  getOverride,
  loadAllOverrides,
  getAllOverrides,
  applyOverrideToResult,
} from './override-engine'

// Action validators
export type { ValidationResult } from './action-validators'
export { validateProductAction }  from './action-validators'

// Lifecycle transitions
export {
  isTransitionAllowed,
  getTargetState,
  getAvailableActionsForTier,
} from './lifecycle-transitions'

// Audit log
export {
  appendAuditEntry,
  loadAuditLog,
  getProductAuditHistory,
  getRecentAuditEntries,
} from './audit-log'

// Action history (timeline)
export { buildProductTimeline } from './action-history'

// Moderation engine
export {
  addNote,
  toggleNotePin,
  setRiskLevel,
  getModerationEntry,
  loadAllModerationEntries,
  getFlaggedProducts,
} from './moderation-engine'

// Product actions
export { executeProductAction } from './product-actions'

// Bulk actions
export { executeBulkAction } from './bulk-actions'

// Reports (catalog table)
export { buildCatalogTableRows } from './reports'
