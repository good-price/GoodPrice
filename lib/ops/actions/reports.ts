/**
 * lib/ops/actions/reports.ts
 *
 * Builds the operational catalog table data by merging:
 *   - All products
 *   - Visibility results (trust tiers)
 *   - Overrides
 *   - Moderation entries
 *   - Live-truth results
 *   - Action queue (pending pipeline actions)
 *   - Quarantine status
 *   - Audit log (last action timestamp)
 *
 * Returns CatalogTableRow[] ready for the CatalogTable component.
 *
 * SERVER-ONLY.
 */

import { getAllProducts }                    from '@/data/catalog'
import { computeCatalogVisibility }          from '@/lib/catalog/trust/visibility-engine'
import { loadAllOverrides, applyOverrideToResult } from './override-engine'
import { loadAllModerationEntries }          from './moderation-engine'
import { loadAllResults }                    from '@/lib/catalog/live-truth/reports'
import { getPendingActionForProduct }        from './bulk-actions'
import { isQuarantined }                     from '@/lib/audit/quarantine'
import { getRecentAuditEntries }             from './audit-log'
import { computeColombiaAvailability }       from '@/lib/catalog/colombia-availability'
import type { CatalogTableRow }              from './types'

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Builds the full catalog table dataset.
 * This is a synchronous, in-memory computation designed for server-render.
 * Typically <100ms for catalogs up to 500 products.
 */
export function buildCatalogTableRows(): CatalogTableRow[] {
  const products    = getAllProducts()
  const results     = computeCatalogVisibility(products)
  const overrides   = loadAllOverrides()
  const moderation  = loadAllModerationEntries()
  const truthResults = loadAllResults()

  // Build last-action map from recent audit entries
  const lastActionMap = new Map<string, string>()
  for (const entry of getRecentAuditEntries(1000)) {
    if (!lastActionMap.has(entry.productId)) {
      lastActionMap.set(entry.productId, entry.timestamp)
    }
  }

  const resultMap = new Map(results.map(r => [r.productId, r]))

  return products.map(product => {
    const id       = product.id ?? ''
    let result     = resultMap.get(id)
    if (!result) {
      // Fallback if product is missing from visibility results
      result = {
        productId:        id,
        tier:             'suppressed',
        publicScore:      0,
        signals:          [],
        warnings:         [],
        isPublic:         false,
        confidence:       'failed',
        suppressionReason: 'Not computed',
        computedAt:       new Date().toISOString(),
      }
    }

    // Apply override if present
    const override = overrides.get(id)
    if (override) result = applyOverrideToResult(result, override)

    // Quarantine overrides everything
    const quarantined = isQuarantined(id)
    if (quarantined) {
      result = { ...result, tier: 'suppressed', isPublic: false }
    }

    const mod   = moderation.get(id)
    const truth = truthResults[id]
    const colEntry = computeColombiaAvailability(id)

    const colombiaOk: boolean | null =
      colEntry == null ? null : colEntry.status === 'available'

    const tier = quarantined ? 'quarantined' : result.tier

    return {
      productId:         id,
      asin:              product.asin ?? '',
      title:             product.title,
      category:          product.category,
      price:             product.price,
      tier,
      isPublic:          result.isPublic && !quarantined,
      publicScore:       result.publicScore,
      suppressionReason: quarantined ? 'En cuarentena' : result.suppressionReason,
      warningCount:      result.warnings.length,
      colombiaOk,
      pricingTruthScore: truth?.pricing?.score ?? null,
      hasFakeDiscount:   truth?.hasFakeDiscount ?? false,
      productStatus:     product.status ?? 'unknown',
      hasOverride:       !!override && !quarantined,
      overrideTier:      override?.tier ?? null,
      overrideOperator:  override?.operator ?? null,
      riskLevel:         mod?.riskLevel ?? null,
      hasNote:           (mod?.notes.length ?? 0) > 0,
      pendingAction:     getPendingActionForProduct(id),
      lastActionAt:      lastActionMap.get(id) ?? null,
      clickCount:        -1,   // enriched in admin page from analytics after build
    } satisfies CatalogTableRow
  })
}
