/**
 * lib/ops/actions/product-actions.ts
 *
 * Executes individual product actions with full validation, audit logging,
 * and state management.
 *
 * Each action:
 *   1. Validates via action-validators.ts
 *   2. Executes the state change
 *   3. Appends to audit log
 *   4. Returns ActionResult
 *
 * SERVER-ONLY.
 */

import { getAllProducts }             from '@/data/catalog'
import { quarantineProduct, unquarantineProduct, isQuarantined } from '@/lib/audit/quarantine'
import { invalidateVisibilityContext } from '@/lib/catalog/trust/visibility-engine'
import { validateProductAction }      from './action-validators'
import { setOverride, removeOverride, getOverride } from './override-engine'
import { appendAuditEntry }           from './audit-log'
import { enqueueAction }              from './bulk-actions'
import { getTargetState }             from './lifecycle-transitions'
import type { ProductAction, ActionResult } from './types'
import type { Product }              from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function findProduct(productId: string): Product | null {
  return getAllProducts().find(p => p.id === productId) ?? null
}

function describeState(product: Product, tier: string, hasOverride: boolean): string {
  const override = hasOverride ? ' (override)' : ''
  return `tier=${tier}${override} status=${product.status ?? 'unknown'}`
}

// ── Action executor ────────────────────────────────────────────────────────────

/**
 * Executes a single product action.
 *
 * @param productId  — the product to act on
 * @param action     — the action to take
 * @param operator   — who is taking the action (e.g. 'admin', 'api')
 * @param reason     — human-readable reason (required for audit log)
 * @param options    — action-specific options
 */
export async function executeProductAction(
  productId: string,
  action:    ProductAction,
  operator:  string,
  reason:    string,
  options:   Record<string, unknown> = {},
): Promise<ActionResult> {
  const product = findProduct(productId)
  if (!product) {
    return { ok: false, action, productId, message: 'Product not found', error: 'PRODUCT_NOT_FOUND' }
  }

  // Determine current tier (check override first)
  const existingOverride = getOverride(productId)
  const currentTier = isQuarantined(productId)
    ? 'quarantined'
    : existingOverride?.tier ?? 'unknown'

  // Since we don't re-run full trust here (expensive), use 'suppressed' as the
  // effective tier for products without override — validation still applies.
  const effectiveTier = currentTier === 'unknown' ? 'suppressed' : currentTier

  // Get suppression reason for override validation (use stored override reason or no reason)
  const suppressionReason = existingOverride?.tier === 'suppressed'
    ? existingOverride.reason
    : null

  const previousState = describeState(product, effectiveTier, !!existingOverride)

  // ── Validate ───────────────────────────────────────────────────────────────
  const validation = validateProductAction(product, action, effectiveTier, suppressionReason)
  if (!validation.allowed) {
    return {
      ok:        false,
      action,
      productId,
      message:   validation.reason,
      error:     'VALIDATION_FAILED',
    }
  }

  // ── Execute ────────────────────────────────────────────────────────────────
  let nextState = getTargetState(action) ?? effectiveTier
  let execError: string | undefined

  try {
    switch (action) {
      case 'activate':
        setOverride(productId, 'active', operator, reason, !!(options.protected))
        invalidateVisibilityContext()
        break

      case 'downgrade':
        setOverride(productId, 'degraded', operator, reason, false)
        invalidateVisibilityContext()
        break

      case 'suppress':
        setOverride(productId, 'suppressed', operator, reason, !!(options.protected))
        invalidateVisibilityContext()
        break

      case 'restore':
        removeOverride(productId)
        invalidateVisibilityContext()
        nextState = 'automated (override removed)'
        break

      case 'quarantine': {
        quarantineProduct({
          productId,
          asin:          product.asin ?? '',
          title:         product.title,
          category:      product.category,
          reason,
          quarantinedBy: 'manual',
          score:         undefined,
        })
        removeOverride(productId)  // overrides don't survive quarantine
        invalidateVisibilityContext()
        break
      }

      case 'unquarantine':
        unquarantineProduct(productId)
        invalidateVisibilityContext()
        nextState = 'suppressed (cuarentena removida — re-evaluar via pipeline)'
        break

      case 'archive':
        // Archive sets a permanent 'suppressed' override + marks as protected
        setOverride(productId, 'suppressed', operator, `ARCHIVED: ${reason}`, true)
        invalidateVisibilityContext()
        nextState = 'archived (suppressed indefinitely)'
        break

      // Pipeline-queue actions
      case 'repair':
      case 'revalidate':
      case 'refresh-truth':
      case 'refresh-pricing':
      case 'rerun-repair':
        enqueueAction(productId, product.asin ?? '', action, operator, reason)
        nextState = `queued: ${action}`
        break

      default:
        execError = `Unknown action: ${action}`
    }
  } catch (err) {
    execError = err instanceof Error ? err.message : String(err)
  }

  const success = !execError

  // ── Audit log ──────────────────────────────────────────────────────────────
  const auditEntry = appendAuditEntry(
    productId,
    product.asin ?? '',
    product.title,
    action,
    operator,
    reason,
    previousState,
    nextState,
    success,
    execError,
  )

  if (!success) {
    return {
      ok:        false,
      action,
      productId,
      message:   execError ?? 'Execution failed',
      auditId:   auditEntry.id,
      error:     'EXECUTION_ERROR',
    }
  }

  return {
    ok:        true,
    action,
    productId,
    message:   `Action '${action}' executed successfully. New state: ${nextState}`,
    auditId:   auditEntry.id,
  }
}
