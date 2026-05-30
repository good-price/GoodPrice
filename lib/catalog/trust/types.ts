/**
 * lib/catalog/trust/types.ts
 *
 * Core types for the GOODPRICE multi-tier trust and visibility system.
 *
 * Visibility tiers (ordered from best to worst):
 *   active     — fully healthy, normal visibility and ranking
 *   warning    — minor issues, visible with informational badge
 *   degraded   — significant issues, visible with reduced ranking
 *   suppressed — hidden from all public surfaces
 */

// ── Tier & severity ───────────────────────────────────────────────────────────

export type VisibilityTier = 'active' | 'warning' | 'degraded' | 'suppressed'

export type TierSeverity = 'ok' | 'warning' | 'degraded' | 'critical'

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'failed'

// ── Public-facing badges ──────────────────────────────────────────────────────

/**
 * Codes for public-safe warning badges shown on product cards.
 * NEVER expose internal system details via these badges.
 */
export type BadgeCode =
  | 'IMG_QUALITY'          // "Imagen pendiente"
  | 'AVAILABILITY_CHECK'   // "Validando disponibilidad"
  | 'COLOMBIA_IMPORT'      // "Importación limitada"
  | 'PRICE_UPDATE'         // "Precio en actualización"
  | 'PARTIAL_INFO'         // "Información parcialmente verificada"

export interface WarningBadge {
  code:     BadgeCode
  label:    string           // public-safe user-visible text
  severity: 'info' | 'warning'
}

// ── Gate signals ──────────────────────────────────────────────────────────────

/**
 * A single gate's contribution to the product's visibility tier.
 * Internal only — not exposed to users.
 */
export interface VisibilitySignal {
  gate:   string           // e.g. 'gate-5v', 'gate-10'
  tier:   VisibilityTier
  reason: string           // internal reason for admin/diagnostics
}

// ── Main result ───────────────────────────────────────────────────────────────

export interface VisibilityResult {
  productId:         string
  tier:              VisibilityTier
  /** Composite public trust score 0–100 */
  publicScore:       number
  signals:           VisibilitySignal[]
  warnings:          WarningBadge[]
  /** true when tier is NOT 'suppressed' */
  isPublic:          boolean
  confidence:        ConfidenceLevel
  /** Primary reason when tier === 'suppressed', for admin display */
  suppressionReason: string | null
  computedAt:        string
}

// ── Context (preloaded gate data) ─────────────────────────────────────────────

/**
 * Pre-loaded context passed to all gate evaluators.
 * Built once per catalog scan to avoid repeated disk reads.
 */
export interface VisibilityContext {
  quarantinedIds:          Set<string>
  latestAuditScores:       Map<string, number>
  auditHistory:            Map<string, number[]>
  failureCounts:           Map<string, number>
  intelligenceSuppressedIds: Set<string>
  /** productId → { suppressedAt, reason, truthScore } */
  healingEntries:          Map<string, HealingEntry>
}

export interface HealingEntry {
  suppressedAt: string
  reason:       string
  truthScore:   number
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface TrustReport {
  totalProducts:       number
  active:              number
  warning:             number
  degraded:            number
  suppressed:          number
  /** active + warning + degraded */
  visible:             number
  avgPublicScore:      number
  suppressionBreakdown: Record<string, number>
  warningBreakdown:    Partial<Record<BadgeCode, number>>
  /** Suppressed products that could realistically be promoted */
  recoveryCandidates:  number
  computedAt:          string
}

export interface RecoveryCandidate {
  productId:     string
  asin:          string
  currentTier:   VisibilityTier
  targetTier:    VisibilityTier
  reason:        string
  confidence:    ConfidenceLevel
}
