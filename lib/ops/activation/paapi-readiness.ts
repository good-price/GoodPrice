/**
 * lib/ops/activation/paapi-readiness.ts
 *
 * Reads PA-API client configuration and image health to assess
 * how many products can be recovered via a PA-API sync.
 *
 * SERVER-ONLY.
 */

import { getPaapiClient }   from '@/lib/paapi/client'
import { countStaleImages } from '@/lib/paapi/image-sync'
import type { PaapiReadiness } from './types'

// ── Public API ────────────────────────────────────────────────────────────────

export function getPaapiReadiness(): PaapiReadiness {
  let configured          = false
  let staleImages         = 0
  let freshImages         = 0
  let totalImages         = 0

  try {
    configured = getPaapiClient().isConfigured
  } catch { /* paapi not initialized */ }

  try {
    const counts = countStaleImages()
    staleImages  = counts.stale
    freshImages  = counts.fresh
    totalImages  = counts.total
  } catch { /* image-sync not initialized */ }

  const recoverableProducts = staleImages
  const imageRecoveryPct    = totalImages > 0
    ? Math.round((freshImages / totalImages) * 100)
    : 0

  let recommendation: string | null = null
  if (!configured && staleImages > 0) {
    recommendation = `Configura PA-API para recuperar ${staleImages} imágenes stale`
  } else if (!configured) {
    recommendation = 'Configura PA-API (PAAPI_ACCESS_KEY, PAAPI_SECRET_KEY) para habilitar recuperación de imágenes'
  } else if (staleImages > 5) {
    recommendation = `Ejecuta PA-API sync para actualizar ${staleImages} imágenes desactualizadas`
  }

  return {
    computedAt:          new Date().toISOString(),
    configured,
    staleImages,
    freshImages,
    totalImages,
    recoverableProducts,
    imageRecoveryPct,
    recommendation,
  }
}
