/**
 * GOODPRICE Audit — Colombia Shipping Validator
 *
 * Re-uses lib/catalog/colombia.ts rule engine to assess each product's
 * shipping eligibility for Colombian users, then maps the result to an
 * audit severity/notes record.
 *
 * This is a pure in-memory check — no network calls.
 */

import { applyColombiaRules } from '@/lib/catalog/colombia'
import type { RawProduct } from '@/types'
import type { ColombiaCheckResult, AuditSeverity } from '../types'
import { buildAsinUrl } from '@/lib/affiliate'

/** Run a Colombia shipping audit for a single raw product */
export function auditColombia(product: RawProduct): ColombiaCheckResult {
  const notes: string[] = []
  const confirmedShipping = product.shipsToColombiaConfirmed === true

  // Hydrate minimally so applyColombiaRules can read amazonUrl and brand
  const hydrated = {
    ...product,
    amazonUrl: buildAsinUrl(product.asin),
  }

  const checked  = applyColombiaRules(hydrated)
  const shippable = !checked.colombiaRestriction

  let severity: AuditSeverity = 'ok'

  if (!shippable) {
    severity = 'critical'
    notes.push(`Bloqueado para Colombia: ${checked.colombiaRestriction}`)
  } else {
    if (!confirmedShipping) {
      severity = 'info'
      notes.push('shipsToColombiaConfirmed no está marcado — disponibilidad sin confirmar')
    } else {
      notes.push('Envío a Colombia confirmado y sin restricciones de reglas')
    }
  }

  // Additional context notes
  if (product.colombiaRestriction) {
    // Already manually flagged in catalog
    notes.push(`Restricción manual en catálogo: ${product.colombiaRestriction}`)
    if (shippable) {
      // Conflict: rule engine says ok but manual flag says restricted
      severity = 'warning'
      notes.push('Conflicto: restricción manual presente pero reglas automáticas no la detectaron')
    }
  }

  return {
    productId:         product.id,
    shippable,
    restriction:       checked.colombiaRestriction,
    confirmedShipping,
    severity,
    notes,
  }
}
