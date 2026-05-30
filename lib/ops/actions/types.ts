/**
 * lib/ops/actions/types.ts
 *
 * All types for the GOODPRICE Phase 35 Action Layer.
 *
 * The action layer provides human-in-the-loop control on top of the
 * autonomous trust tier / stabilization system.
 *
 * Key design principle:
 *   Automated protections (gates, quarantine, healing) are NEVER bypassed.
 *   Overrides apply AFTER the trust engine runs and only for soft gates.
 *   Hard gates (inactive status, Colombia restriction, quarantine, invalid ASIN,
 *   invalid image, intelligence CRITICAL) cannot be overridden.
 */

// ── Product actions ────────────────────────────────────────────────────────────

/**
 * All actions an operator can take on a single product.
 * Actions are grouped by type:
 *   tier-override  — force/clear a visibility tier
 *   lifecycle      — change product lifecycle state
 *   pipeline       — queue for automated pipeline job
 *   moderation     — add notes, risk, comments
 */
export type ProductAction =
  | 'activate'          // Force to active tier (soft-gate override only)
  | 'downgrade'         // Force to degraded tier
  | 'suppress'          // Force to suppressed tier
  | 'quarantine'        // Add to quarantine list (gate-3)
  | 'unquarantine'      // Remove from quarantine (unsafe products cannot be unquarantined)
  | 'archive'           // Permanently archive (status = inactive, cannot activate)
  | 'restore'           // Remove any manual override — let automation decide
  | 'repair'            // Queue for repair pipeline
  | 'revalidate'        // Queue for live-truth validation
  | 'refresh-truth'     // Queue for truth score refresh
  | 'refresh-pricing'   // Queue for pricing refresh
  | 'rerun-repair'      // Queue for repair re-run

/** Subset of actions that set a forced tier */
export type TierOverrideAction = 'activate' | 'downgrade' | 'suppress'

/** Subset of actions that queue a pipeline job */
export type PipelineQueueAction = 'repair' | 'revalidate' | 'refresh-truth' | 'refresh-pricing' | 'rerun-repair'

// ── Override ───────────────────────────────────────────────────────────────────

export type OverrideTier = 'active' | 'degraded' | 'suppressed'

export interface ProductOverride {
  productId:   string
  tier:        OverrideTier
  operator:    string
  reason:      string
  appliedAt:   string   // ISO
  expiresAt?:  string   // ISO — optional expiry
  /** If true, this override was applied to resist automation recompute */
  protected:   boolean
}

export interface OverrideStore {
  updatedAt: string
  overrides: Record<string, ProductOverride>  // productId → override
}

// ── Action queue (for pipeline-type actions) ───────────────────────────────────

export type QueuedActionType = PipelineQueueAction

export interface QueuedAction {
  id:           string
  productId:    string
  asin:         string
  actionType:   QueuedActionType
  operator:     string
  reason?:      string
  queuedAt:     string
  /** Set when a job picks this up */
  startedAt?:   string
  /** Set when the job completes */
  completedAt?: string
  status:       'pending' | 'running' | 'done' | 'failed'
}

export interface ActionQueue {
  updatedAt: string
  items:     QueuedAction[]
}

// ── Moderation ─────────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ModerationNote {
  id:         string
  productId:  string
  operator:   string
  text:       string
  createdAt:  string
  pinned:     boolean
}

export interface ModerationEntry {
  productId:  string
  riskLevel:  RiskLevel | null
  notes:      ModerationNote[]
  flaggedAt:  string | null
  flaggedBy:  string | null
  updatedAt:  string
}

export interface ModerationStore {
  updatedAt: string
  entries:   Record<string, ModerationEntry>  // productId → entry
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export interface ActionAuditEntry {
  id:            string
  productId:     string
  asin:          string
  title:         string
  action:        ProductAction
  operator:      string
  reason:        string
  previousState: string   // human-readable snapshot
  nextState:     string
  timestamp:     string
  success:       boolean
  error?:        string
}

export interface ActionAuditLog {
  updatedAt: string
  entries:   ActionAuditEntry[]   // newest first, max 1000
}

// ── Action result ──────────────────────────────────────────────────────────────

export interface ActionResult {
  ok:       boolean
  action:   ProductAction
  productId: string
  message:  string
  auditId?: string
  error?:   string
}

export interface BulkActionResult {
  ok:         boolean
  action:     ProductAction
  total:      number
  succeeded:  number
  failed:     number
  results:    ActionResult[]
}

// ── Catalog table row ──────────────────────────────────────────────────────────

export interface CatalogTableRow {
  productId:        string
  asin:             string
  title:            string
  category:         string
  price:            number
  tier:             string        // VisibilityTier
  isPublic:         boolean
  publicScore:      number
  suppressionReason: string | null
  warningCount:     number
  colombiaOk:       boolean | null
  pricingTruthScore: number | null
  hasFakeDiscount:  boolean
  productStatus:    string        // ProductStatus
  hasOverride:      boolean
  overrideTier:     string | null
  overrideOperator: string | null
  riskLevel:        RiskLevel | null
  hasNote:          boolean
  pendingAction:    QueuedActionType | null
  lastActionAt:     string | null
  /** 0 = no clicks tracked; >0 = known click count. -1 = data unavailable. */
  clickCount:       number
}

// ── Action history entry (per-product timeline) ───────────────────────────────

export interface ProductHistoryEntry {
  timestamp:  string
  event:      string
  detail:     string
  operator:   string | null
  automated:  boolean
}
