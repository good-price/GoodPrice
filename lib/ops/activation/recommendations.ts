/**
 * lib/ops/activation/recommendations.ts
 *
 * Aggregates and prioritizes actionable recommendations from:
 * - Visibility audit (suppression alerts)
 * - TRM monitor (stale rate)
 * - PA-API readiness (unconfigured)
 * - Truth queue (backlog)
 * - Execution insights (stalled queues, failure patterns)
 * - Stabilization recommendations (existing system)
 *
 * Returns ranked list, highest impact first.
 *
 * SERVER-ONLY.
 */

import { loadStabilizationReport } from '@/lib/catalog/stabilization/reports'
import type {
  ActivationRecommendation,
  VisibilityAuditResult,
  TruthQueueStatus,
  PaapiReadiness,
  TrmMonitorStatus,
  ExecutionInsights,
} from './types'

// ── Priority weights ──────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = {
  immediate: 0,
  high:      1,
  medium:    2,
  low:       3,
}

let _idCounter = 0
function makeId(action: string): string {
  return `rec-${action}-${++_idCounter}`
}

// ── Recommendation builders ───────────────────────────────────────────────────

export function buildActivationRecommendations(
  audit:    VisibilityAuditResult,
  queue:    TruthQueueStatus,
  paapi:    PaapiReadiness,
  trm:      TrmMonitorStatus,
  insights: ExecutionInsights,
): ActivationRecommendation[] {
  _idCounter = 0  // reset per call
  const recs: ActivationRecommendation[] = []

  // ── Critical: run full recovery pipeline when heavily suppressed ──────────
  if (audit.alertSuppressed || audit.status === 'critical' || audit.status === 'over-suppressed') {
    recs.push({
      id:          makeId('run-recovery-pipeline'),
      action:      'run-recovery-pipeline',
      priority:    'immediate',
      title:       'Ejecutar Recovery Pipeline',
      description: `${audit.suppressedPct}% del catálogo está suprimido. El recovery pipeline restaurará visibilidad.`,
      impact:      `Puede recuperar hasta ${audit.suppressed} productos suprimidos`,
      endpoint:    '/api/ops/run',
      method:      'POST',
      body:        { pipeline: 'recovery', operator: 'admin' },
      tags:        ['recovery', 'suppression', 'urgent'],
    })
  }

  // ── High: recovery when just below visible threshold ─────────────────────
  if (!audit.alertSuppressed && audit.alertVisible && audit.status === 'degraded') {
    recs.push({
      id:          makeId('run-recovery-pipeline'),
      action:      'run-recovery-pipeline',
      priority:    'high',
      title:       'Mejorar Visibilidad del Catálogo',
      description: `Solo ${audit.visiblePct}% visible. Ejecutar pipeline de recuperación.`,
      impact:      'Mejora la tasa de visibilidad pública',
      endpoint:    '/api/ops/run',
      method:      'POST',
      body:        { pipeline: 'recovery', operator: 'admin' },
      tags:        ['recovery', 'visibility'],
    })
  }

  // ── Configure PA-API when unconfigured and there are stale images ─────────
  if (!paapi.configured && paapi.staleImages > 0) {
    recs.push({
      id:          makeId('configure-paapi'),
      action:      'configure-paapi',
      priority:    'high',
      title:       'Configurar PA-API',
      description: `${paapi.staleImages} imágenes stale no se pueden recuperar sin PA-API.`,
      impact:      `Recuperar ${paapi.staleImages} imágenes → más productos visibles`,
      tags:        ['paapi', 'images', 'configuration'],
    })
  }

  // ── Stale TRM ─────────────────────────────────────────────────────────────
  if (trm.alertStale || trm.alertFallback) {
    recs.push({
      id:          makeId('update-trm'),
      action:      'update-trm',
      priority:    trm.alertFallback ? 'high' : 'medium',
      title:       trm.alertFallback ? 'Actualizar TRM (en fallback)' : 'Actualizar TRM',
      description: trm.alertFallback
        ? 'La TRM usa el valor hardcoded de fallback. Los precios COP pueden ser incorrectos.'
        : `TRM desactualizada (${trm.ageHours}h). Las conversiones USD→COP pueden estar desviadas.`,
      impact:      'Precios COP correctos para todos los productos',
      endpoint:    '/api/currency/update',
      method:      'POST',
      body:        {},
      tags:        ['trm', 'pricing', 'currency'],
    })
  }

  // ── Truth queue backlog ───────────────────────────────────────────────────
  if (queue.backlog) {
    recs.push({
      id:          makeId('validate-batch'),
      action:      'validate-batch',
      priority:    'medium',
      title:       'Limpiar Backlog de Validación',
      description: `${queue.pending} productos pendientes de validación live truth.`,
      impact:      'Precios y disponibilidad actualizados en tiempo real',
      endpoint:    '/api/catalog/live-truth/run',
      method:      'POST',
      body:        { operator: 'admin' },
      tags:        ['truth', 'validation', 'backlog'],
    })
  }

  // ── Stale truth items ─────────────────────────────────────────────────────
  if (queue.stale > 10 && !queue.backlog) {
    recs.push({
      id:          makeId('run-live-truth'),
      action:      'run-live-truth',
      priority:    'medium',
      title:       'Revalidar Productos Stale',
      description: `${queue.stale} productos sin validar en más de 48h.`,
      impact:      'Detección temprana de cambios de precio o disponibilidad',
      endpoint:    '/api/catalog/live-truth/run',
      method:      'POST',
      body:        { operator: 'admin' },
      tags:        ['truth', 'stale', 'validation'],
    })
  }

  // ── Execution failures ────────────────────────────────────────────────────
  if (insights.stalledQueues.length > 0) {
    recs.push({
      id:          makeId('run-trust-recompute'),
      action:      'run-trust-recompute',
      priority:    'medium',
      title:       'Revisar Colas Estancadas',
      description: `Colas con fallos consecutivos: ${insights.stalledQueues.join(', ')}.`,
      impact:      'Restablecer ejecución normal del pipeline',
      endpoint:    '/api/catalog/trust/recompute',
      method:      'POST',
      body:        { operator: 'admin' },
      tags:        ['execution', 'stalled', 'failure'],
    })
  }

  // ── Colombia audit if visibility is ok but colombia health unknown ─────────
  if (!audit.alertSuppressed && audit.status === 'healthy' && audit.total > 0) {
    recs.push({
      id:          makeId('run-colombia-audit'),
      action:      'run-colombia-audit',
      priority:    'low',
      title:       'Auditar Disponibilidad Colombia',
      description: 'Mantener Gate 10 actualizado con la disponibilidad de envíos a Colombia.',
      impact:      'Catálogo Colombia preciso — evita mostrar productos no enviables',
      endpoint:    '/api/catalog/colombia-audit/run',
      method:      'POST',
      body:        { operator: 'admin' },
      tags:        ['colombia', 'availability', 'gate10'],
    })
  }

  // ── Augment with stabilization recommendations ────────────────────────────
  try {
    const stabReport = loadStabilizationReport()
    if (stabReport) {
      const existing = new Set(recs.map(r => r.endpoint))
      for (const rec of stabReport.recommendations.slice(0, 3)) {
        if (rec.endpoint && existing.has(rec.endpoint)) continue
        recs.push({
          id:          makeId(rec.type),
          action:      rec.type as ActivationRecommendation['action'],
          priority:    rec.priority as ActivationRecommendation['priority'],
          title:       rec.title,
          description: rec.description,
          impact:      rec.impact,
          endpoint:    rec.endpoint,
          method:      rec.method,
          body:        rec.body,
          tags:        [rec.type],
        })
      }
    }
  } catch { /* stabilization report not available */ }

  // Sort by priority
  return recs.sort((a, b) =>
    (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4),
  )
}
