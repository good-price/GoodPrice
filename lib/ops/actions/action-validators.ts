/**
 * lib/ops/actions/action-validators.ts
 *
 * Validates product actions before execution to prevent:
 *   - Restoring quarantined recalled/dangerous products
 *   - Activating products suppressed by hard gates
 *   - Invalid state transitions
 *   - Unsafe overrides that would expose dangerous products
 *
 * IMPORTANT: This is the safety firewall between human intent and execution.
 * All actions MUST pass validation before any state change occurs.
 *
 * SERVER-ONLY.
 */

import { isQuarantined, getQuarantineEntry } from '@/lib/audit/quarantine'
import { isTransitionAllowed }               from './lifecycle-transitions'
import type { ProductAction }                from './types'
import type { Product }                      from '@/types'

// ── Hard-gate suppression reasons (cannot be overridden) ──────────────────────

/** Substrings in suppressionReason that indicate a hard gate — no override allowed */
const HARD_GATE_SIGNALS = [
  'inactive',           // gate-1: product status is inactive
  'Colombia restriction', // gate-2
  'quarantine',         // gate-3
  'Invalid or missing ASIN', // gate-4
  'structurally invalid', // gate-5
  'dead ASIN',          // gate-5e
  'CRITICAL',           // gate-8: intelligence
]

/** Quarantine reason substrings that are non-negotiable (recalled, dangerous) */
const NON_NEGOTIABLE_QUARANTINE = [
  'recall',
  'dangerous',
  'unsafe',
  'hazmat',
  'banned',
  'counterfeit',
  'prohibited',
]

// ── Validation result ──────────────────────────────────────────────────────────

export interface ValidationResult {
  allowed:  boolean
  reason:   string
}

// ── Validator ──────────────────────────────────────────────────────────────────

/**
 * Validates whether an action can be executed on a product.
 *
 * @param product  — the full product object
 * @param action   — the action being requested
 * @param currentTier — the product's current trust tier
 * @param suppressionReason — the current suppression reason (if any)
 * @param operator — the operator requesting the action
 */
export function validateProductAction(
  product:          Product,
  action:           ProductAction,
  currentTier:      string,
  suppressionReason: string | null,
): ValidationResult {
  const id = product.id ?? 'unknown'

  // ── 1. Transition table check ──────────────────────────────────────────────
  if (!isTransitionAllowed(currentTier, action)) {
    return {
      allowed: false,
      reason:  `Transition '${action}' is not allowed from tier '${currentTier}'.`,
    }
  }

  // ── 2. Quarantine rules ────────────────────────────────────────────────────
  if (action === 'unquarantine' || action === 'activate' || action === 'restore') {
    if (isQuarantined(id)) {
      const entry = getQuarantineEntry(id)
      if (entry) {
        const reason = entry.reason.toLowerCase()
        const isNonNegotiable = NON_NEGOTIABLE_QUARANTINE.some(sig => reason.includes(sig))
        if (isNonNegotiable) {
          return {
            allowed: false,
            reason:  `Cannot ${action} product: quarantine reason contains non-negotiable signal ("${entry.reason}"). Manual review required.`,
          }
        }
        // Can only unquarantine via explicit 'unquarantine' action, not 'activate'
        if (action === 'activate' || action === 'restore') {
          return {
            allowed: false,
            reason:  `Product is quarantined. Use 'unquarantine' first, then re-evaluate via pipeline.`,
          }
        }
      }
    }
  }

  // ── 3. Hard-gate override prevention ──────────────────────────────────────
  if (action === 'activate') {
    // Cannot activate a product suppressed by a hard gate
    if (suppressionReason) {
      const isHardGate = HARD_GATE_SIGNALS.some(sig =>
        suppressionReason.toLowerCase().includes(sig.toLowerCase())
      )
      if (isHardGate) {
        return {
          allowed: false,
          reason:  `Cannot force-activate: suppression is caused by a hard gate ("${suppressionReason}"). Fix the underlying issue first.`,
        }
      }
    }

    // Cannot activate a product with status=inactive
    if (product.status === 'inactive') {
      return {
        allowed: false,
        reason:  `Cannot force-activate: product status is 'inactive'. Change the catalog status first.`,
      }
    }

    // Cannot activate if ASIN is missing/invalid (would break Amazon links)
    if (!product.asin || !/^B[0-9A-Z]{9}$/.test(product.asin)) {
      return {
        allowed: false,
        reason:  `Cannot force-activate: product has an invalid or missing ASIN ("${product.asin ?? ''}").`,
      }
    }
  }

  // ── 4. Archive rules ───────────────────────────────────────────────────────
  if (action === 'archive') {
    // Already quarantined products should be unquarantined before archive
    // (or quarantine protections must be respected)
    if (isQuarantined(id)) {
      return {
        allowed: false,
        reason:  `Cannot archive a quarantined product. Unquarantine it first or keep it in quarantine.`,
      }
    }
  }

  // ── 5. Pipeline actions — always allowed for non-archived products ─────────
  const pipelineActions: ProductAction[] = [
    'repair', 'revalidate', 'refresh-truth', 'refresh-pricing', 'rerun-repair',
  ]
  if (pipelineActions.includes(action)) {
    if (currentTier === 'archived') {
      return {
        allowed: false,
        reason:  `Cannot queue pipeline action for archived product.`,
      }
    }
    // Otherwise always allowed
    return { allowed: true, reason: 'ok' }
  }

  return { allowed: true, reason: 'ok' }
}
