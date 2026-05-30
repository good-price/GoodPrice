/**
 * lib/ops/action-center.ts
 *
 * Defines and executes admin quick actions for the GOODPRICE Operations Center.
 *
 * Actions are grouped by category and executed server-side by calling
 * the underlying library functions directly (no HTTP round-trip).
 *
 * SERVER-ONLY.
 */

import { runHealingCycle }               from '@/lib/catalog/self-healing'
import { unsuppressProduct, loadSuppressedStore } from '@/lib/catalog/live-truth'
import type { QuickAction, ActionResult } from './types'

// ── Action definitions ────────────────────────────────────────────────────────

export function getAvailableActions(): QuickAction[] {
  return [
    // ── Validation ──────────────────────────────────────────────────────────
    {
      id:           'run_validation',
      label:        'Ejecutar validación',
      description:  'Valida los siguientes 5 productos de la cola de Live Truth.',
      endpoint:     '/api/catalog/live-truth/run',
      method:       'POST',
      body:         { limit: 5 },
      category:     'validation',
      durationHint: '~15 seg',
    },
    {
      id:           'run_validation_batch',
      label:        'Validación batch (20)',
      description:  'Valida los siguientes 20 productos. Puede tomar hasta 5 minutos.',
      endpoint:     '/api/catalog/live-truth/run',
      method:       'POST',
      body:         { limit: 20, delayMs: 1500 },
      category:     'validation',
      durationHint: '~3-5 min',
    },

    // ── Healing ─────────────────────────────────────────────────────────────
    {
      id:           'run_healing',
      label:        'Ciclo de auto-reparación',
      description:  'Ejecuta el pipeline completo: archivar, recuperar, reparar drift, sugerencias de reemplazo.',
      endpoint:     '/api/catalog/self-healing/run',
      method:       'POST',
      body:         { forceRun: false },
      category:     'healing',
      durationHint: '~2 seg',
    },
    {
      id:           'run_healing_dry',
      label:        'Simular auto-reparación',
      description:  'Muestra qué haría el sistema sin aplicar cambios.',
      endpoint:     '/api/catalog/self-healing/run',
      method:       'POST',
      body:         { dryRun: true, forceRun: true },
      category:     'healing',
      durationHint: '~1 seg',
    },
    {
      id:           'clear_all_suppressions',
      label:        'Limpiar todas las supresiones',
      description:  'Restaura todos los productos auto-suprimidos al catálogo público.',
      endpoint:     '/api/ops/actions',
      method:       'POST',
      body:         { action: 'clear_all_suppressions' },
      category:     'healing',
      durationHint: '< 1 seg',
    },

    // ── Audit ────────────────────────────────────────────────────────────────
    {
      id:           'run_link_audit',
      label:        'Auditoría de enlaces',
      description:  'Verifica accesibilidad de páginas Amazon para los primeros 20 productos.',
      endpoint:     '/api/catalog/link-audit/run',
      method:       'POST',
      body:         { limit: 20 },
      category:     'audit',
      durationHint: '~1-2 min',
    },
    {
      id:           'run_colombia_audit',
      label:        'Auditoría Colombia',
      description:  'Verifica disponibilidad de envío a Colombia para los primeros 20 productos.',
      endpoint:     '/api/catalog/colombia-audit/run',
      method:       'POST',
      body:         { maxProducts: 20 },
      category:     'audit',
      durationHint: '~1-2 min',
    },
    {
      id:           'run_full_audit',
      label:        'Auditoría de calidad',
      description:  'Ejecuta la auditoría completa de scores de fiabilidad.',
      endpoint:     '/api/audit/run',
      method:       'POST',
      body:         { offlineMode: false },
      category:     'audit',
      durationHint: '~30 seg',
    },

    // ── Infrastructure ───────────────────────────────────────────────────────
    {
      id:           'update_currency',
      label:        'Actualizar tipo de cambio',
      description:  'Obtiene la tasa USD→COP actual.',
      endpoint:     '/api/currency/update',
      method:       'POST',
      body:         {},
      category:     'infrastructure',
      durationHint: '~2 seg',
    },
    {
      id:           'run_repair',
      label:        'Reparar imágenes',
      description:  'Ejecuta el pipeline de reparación CDN para imágenes stale.',
      endpoint:     '/api/catalog/repair/run',
      method:       'POST',
      body:         {},
      category:     'infrastructure',
      durationHint: '~10 seg',
    },
  ]
}

// ── Action executor ───────────────────────────────────────────────────────────

/**
 * Execute a quick action server-side.
 * Only a subset of actions are directly executable here;
 * others return their endpoint for the caller to invoke.
 */
export async function executeAction(
  actionId: string,
  params?: Record<string, unknown>,
): Promise<ActionResult> {
  const start = Date.now()

  switch (actionId) {
    case 'run_healing': {
      const result = await runHealingCycle({ dryRun: false })
      return {
        ok:         result.ok,
        actionId,
        durationMs: Date.now() - start,
        message:    `Ciclo completado. Suprimidos: ${result.archived.length}, Recuperados: ${result.recovered.length}, Drift repairs: ${result.driftRepairs.length}`,
        data:       {
          archived:         result.archived.length,
          recovered:        result.recovered.length,
          driftRepairs:     result.driftRepairs.length,
          replacements:     result.replacements.length,
        },
      }
    }

    case 'run_healing_dry': {
      const result = await runHealingCycle({ dryRun: true, ...params })
      return {
        ok:         result.ok,
        actionId,
        durationMs: Date.now() - start,
        message:    `Simulación: ${result.archived.length} supresiones, ${result.recovered.length} recuperaciones, ${result.driftRepairs.length} reparaciones`,
        data:       {
          archived:     result.archived,
          recovered:    result.recovered,
          driftRepairs: result.driftRepairs,
        },
      }
    }

    case 'clear_all_suppressions': {
      const store   = loadSuppressedStore()
      const ids     = Object.keys(store.entries)
      let   cleared = 0
      for (const id of ids) {
        if (unsuppressProduct(id)) cleared++
      }
      return {
        ok:         true,
        actionId,
        durationMs: Date.now() - start,
        message:    `${cleared} producto(s) restaurados al catálogo público`,
        data:       { cleared },
      }
    }

    default:
      return {
        ok:         false,
        actionId,
        durationMs: Date.now() - start,
        message:    `Acción '${actionId}' no ejecutable server-side. Usa el endpoint directamente.`,
      }
  }
}
