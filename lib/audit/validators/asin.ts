/**
 * GOODPRICE Audit — ASIN Validator
 *
 * Wraps the existing lib/catalog/validator.ts HTTP checker with the audit
 * severity/notes model. Does NOT duplicate cache logic — reuses the same
 * 24h in-memory cache already in place.
 */

import { validateAsin, isValidAsinFormat } from '@/lib/catalog/validator'
import type { AsinCheckResult, AuditSeverity } from '../types'

/** Run a full ASIN audit for a single product */
export async function auditAsin(
  productId: string,
  asin: string
): Promise<AsinCheckResult> {
  const checkedAt = new Date().toISOString()
  const notes: string[] = []

  // ── 1. Format check (instant, no network) ────────────────────────────────

  if (!isValidAsinFormat(asin)) {
    notes.push(`Formato inválido: "${asin}" (debe ser exactamente 10 caracteres A-Z 0-9)`)
    return {
      productId,
      asin,
      formatValid:  false,
      reachable:    false,
      checkedAt,
      severity:     'critical',
      notes,
    }
  }

  notes.push('Formato ASIN válido (10 caracteres alfanuméricos)')

  // ── 2. HTTP reachability check ────────────────────────────────────────────

  let reachable: boolean | null = null
  let httpStatus: number | undefined
  let error: string | undefined
  let severity: AuditSeverity

  try {
    const result = await validateAsin(asin)
    httpStatus = result.httpStatus

    if (result.status === 'inactive') {
      // 404 — definitive dead product
      reachable = false
      severity  = 'critical'
      notes.push(`Producto no encontrado en Amazon (HTTP ${httpStatus ?? '404'}) — página 404 definitiva`)
    } else if (result.status === 'unverified') {
      // Network error / Amazon blocked — unknown, don't false-positive
      reachable = null
      severity  = 'warning'
      notes.push('No se pudo verificar: error de red o Amazon bloqueó la solicitud — marcado como no verificado')
    } else {
      // active → page exists
      reachable = true
      severity  = 'ok'
      notes.push(`Página Amazon accesible (HTTP ${httpStatus ?? '200'})`)
    }
  } catch (err) {
    reachable = null
    severity  = 'warning'
    error     = err instanceof Error ? err.message : String(err)
    notes.push(`Error inesperado al verificar ASIN: ${error}`)
  }

  return {
    productId,
    asin,
    formatValid: true,
    httpStatus,
    reachable,
    checkedAt,
    error,
    severity,
    notes,
  }
}
