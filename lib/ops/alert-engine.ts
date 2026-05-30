/**
 * lib/ops/alert-engine.ts
 *
 * Generates actionable system alerts by examining current subsystem state.
 * Alerts represent conditions requiring attention NOW — not historical events.
 *
 * Checks:
 *   - Live truth: no validation in > 48h / avg score < 50 / stalled queue
 *   - Self-healing: > 10 auto-suppressed / mass suppressions in last hour
 *   - Currency: rate stale > 48h
 *   - Catalog: public count critically low
 *   - Link health: > 10 dead links
 *   - Colombia: > 20% unavailable
 *
 * SERVER-ONLY.
 */

import { loadReport as loadTruthReport, loadSuppressedStore, loadQueue } from '@/lib/catalog/live-truth'
import { getHealingSchedule }          from '@/lib/catalog/self-healing'
import { getPublicCatalogStats }       from '@/lib/catalog/public'
import { getRateMeta }                 from '@/lib/currency/cache'
import { getAllProducts }               from '@/data/catalog'
import { analyseCatalogLinkHealth }    from '@/lib/catalog/link-health'
import { analyseCatalogColombiaAvailability } from '@/lib/catalog/colombia-availability'
import type { SystemAlert }            from './types'

// ── Thresholds ────────────────────────────────────────────────────────────────

const TRUTH_STALE_WARNING_H  = 48
const TRUTH_STALE_CRITICAL_H = 96
const TRUTH_LOW_SCORE        = 50
const SUPPRESSION_WARN       = 8
const SUPPRESSION_CRITICAL   = 20
const CURRENCY_STALE_H       = 48
const DEAD_LINKS_WARN        = 5
const DEAD_LINKS_CRITICAL    = 15
const COLOMBIA_UNAVAIL_PCT   = 20
const PUBLIC_MIN_WARN        = 5

function h(hours: number) { return hours * 60 * 60 * 1_000 }
function ageMs(iso: string | null | undefined): number {
  if (!iso) return Infinity
  return Date.now() - new Date(iso).getTime()
}
function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
}

// ── Alert builders ────────────────────────────────────────────────────────────

function checkLiveTruth(): SystemAlert[] {
  const alerts: SystemAlert[] = []
  const report  = loadTruthReport()
  const now     = new Date().toISOString()

  if (!report) {
    alerts.push({
      id:          newId('truth'),
      severity:    'warning',
      subsystem:   'Live Truth',
      title:       'Live Truth nunca ejecutado',
      description: 'No hay reporte de validación. Los precios y disponibilidades del catálogo no se han verificado.',
      suggestion:  'POST /api/catalog/live-truth/run',
      triggeredAt: now,
    })
    return alerts
  }

  const age = ageMs(report.generatedAt)
  if (age > h(TRUTH_STALE_CRITICAL_H)) {
    alerts.push({
      id:          newId('truth-stale'),
      severity:    'critical',
      subsystem:   'Live Truth',
      title:       `Validación sin ejecutar en >${ TRUTH_STALE_CRITICAL_H }h`,
      description: `El último reporte tiene ${Math.round(age / h(1))}h de antigüedad. Los precios podrían estar muy desactualizados.`,
      suggestion:  'POST /api/catalog/live-truth/run { limit: 10 }',
      triggeredAt: now,
    })
  } else if (age > h(TRUTH_STALE_WARNING_H)) {
    alerts.push({
      id:          newId('truth-stale'),
      severity:    'warning',
      subsystem:   'Live Truth',
      title:       `Validación sin ejecutar en >${TRUTH_STALE_WARNING_H}h`,
      description: `El último reporte tiene ${Math.round(age / h(1))}h de antigüedad.`,
      suggestion:  'POST /api/catalog/live-truth/run',
      triggeredAt: now,
    })
  }

  if (report.avgTruthScore > 0 && report.avgTruthScore < TRUTH_LOW_SCORE) {
    alerts.push({
      id:          newId('truth-score'),
      severity:    'critical',
      subsystem:   'Live Truth',
      title:       `Score promedio crítico: ${report.avgTruthScore}/100`,
      description: `El catálogo tiene una confiabilidad media muy baja. ${report.driftedCount} productos con drift, ${report.unavailableCount} no disponibles.`,
      suggestion:  'Revisar productos en el panel Live Truth y ejecutar ciclo de auto-reparación.',
      triggeredAt: now,
    })
  }

  // Check for stalled queue
  const queue = loadQueue()
  if (queue && queue.items.length > 0 && queue.updatedAt) {
    const queueAge = ageMs(queue.updatedAt)
    if (queueAge > h(TRUTH_STALE_CRITICAL_H) && report.totalChecked > 0) {
      alerts.push({
        id:          newId('queue-stall'),
        severity:    'warning',
        subsystem:   'Live Truth',
        title:       `Cola de validación estancada (${queue.items.length} items)`,
        description: `La cola tiene ${queue.items.length} productos pendientes sin procesar en ${Math.round(queueAge / h(1))}h.`,
        suggestion:  'POST /api/catalog/live-truth/run { limit: 10 }',
        triggeredAt: now,
      })
    }
  }

  return alerts
}

function checkSelfHealing(): SystemAlert[] {
  const alerts: SystemAlert[] = []
  const now    = new Date().toISOString()
  const store  = loadSuppressedStore()
  const count  = Object.keys(store.entries).length

  if (count >= SUPPRESSION_CRITICAL) {
    alerts.push({
      id:          newId('supp-crit'),
      severity:    'critical',
      subsystem:   'Self-Healing',
      title:       `${count} productos auto-suprimidos`,
      description: `${count} productos están ocultos del catálogo público por fallos repetidos de validación.`,
      suggestion:  'Revisar panel Self-Healing y ejecutar ciclo de recuperación. POST /api/catalog/self-healing/run',
      triggeredAt: now,
    })
  } else if (count >= SUPPRESSION_WARN) {
    alerts.push({
      id:          newId('supp-warn'),
      severity:    'warning',
      subsystem:   'Self-Healing',
      title:       `${count} productos auto-suprimidos`,
      description: `${count} productos ocultos por validación fallida. Considera revisar si son recuperables.`,
      suggestion:  'POST /api/catalog/self-healing/run { minRecoveryScore: 55 }',
      triggeredAt: now,
    })
  }

  // Healing cycle stale
  const schedule = getHealingSchedule()
  if (!schedule.lastCycleAt) {
    alerts.push({
      id:          newId('heal-never'),
      severity:    'info',
      subsystem:   'Self-Healing',
      title:       'Ciclo de auto-reparación nunca ejecutado',
      description: 'El sistema de auto-reparación no ha corrido aún. Los productos con fallos no serán suprimidos automáticamente.',
      suggestion:  'POST /api/catalog/self-healing/run',
      triggeredAt: now,
    })
  }

  return alerts
}

function checkCurrency(): SystemAlert[] {
  const alerts: SystemAlert[] = []
  const now  = new Date().toISOString()
  const meta = getRateMeta()
  const age  = ageMs(meta.fetchedAt ?? undefined)

  if (meta.isFallback || age > h(CURRENCY_STALE_H)) {
    alerts.push({
      id:          newId('currency'),
      severity:    'warning',
      subsystem:   'Divisa',
      title:       meta.isFallback
        ? 'Tipo de cambio en modo fallback'
        : `Tipo de cambio desactualizado (${Math.round(age / h(1))}h)`,
      description: `La tasa USD→COP que se muestra a usuarios puede no ser la actual. Tasa actual: ${meta.rate.toLocaleString('es-CO')} COP/USD.`,
      suggestion:  'POST /api/currency/update',
      triggeredAt: now,
    })
  }

  return alerts
}

function checkCatalogHealth(): SystemAlert[] {
  const alerts: SystemAlert[] = []
  const now   = new Date().toISOString()
  const stats = getPublicCatalogStats()

  if (stats.public < PUBLIC_MIN_WARN) {
    alerts.push({
      id:          newId('catalog-empty'),
      severity:    'critical',
      subsystem:   'Catálogo',
      title:       `Solo ${stats.public} productos públicos`,
      description: 'El catálogo público está casi vacío. Las páginas de usuarios mostrarán estado vacío.',
      suggestion:  'Revisar gates de visibilidad, cuarentena y scores de auditoría.',
      triggeredAt: now,
    })
  }

  return alerts
}

function checkLinkAndColombia(): SystemAlert[] {
  const alerts: SystemAlert[] = []
  const now      = new Date().toISOString()
  const products = getAllProducts()

  try {
    const linkReport = analyseCatalogLinkHealth(products)
    if (linkReport.dead >= DEAD_LINKS_CRITICAL) {
      alerts.push({
        id:          newId('links-crit'),
        severity:    'critical',
        subsystem:   'Link Health',
        title:       `${linkReport.dead} enlaces Amazon muertos (Gate 9)`,
        description: `${linkReport.dead} productos suprimidos por enlace muerto. Posible cambio masivo de ASINs en Amazon.`,
        suggestion:  'POST /api/catalog/link-audit/run',
        triggeredAt: now,
      })
    } else if (linkReport.dead >= DEAD_LINKS_WARN) {
      alerts.push({
        id:          newId('links-warn'),
        severity:    'warning',
        subsystem:   'Link Health',
        title:       `${linkReport.dead} enlaces Amazon muertos`,
        description: `${linkReport.dead} productos ocultos por Gate 9 (enlace muerto).`,
        suggestion:  'POST /api/catalog/link-audit/run para re-auditar',
        triggeredAt: now,
      })
    }
  } catch { /* graceful — link health data optional */ }

  try {
    const colReport = analyseCatalogColombiaAvailability(products)
    if (colReport.total > 0) {
      const pct = Math.round((colReport.unavailable / colReport.total) * 100)
      if (pct >= COLOMBIA_UNAVAIL_PCT) {
        alerts.push({
          id:          newId('colombia'),
          severity:    'warning',
          subsystem:   'Colombia',
          title:       `${pct}% del catálogo no disponible para Colombia`,
          description: `${colReport.unavailable} de ${colReport.total} productos suprimidos por Gate 10.`,
          suggestion:  'POST /api/catalog/colombia-audit/run para re-auditar disponibilidad',
          triggeredAt: now,
        })
      }
    }
  } catch { /* graceful */ }

  return alerts
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate all active system alerts.
 * Returns alerts sorted critical → warning → info.
 */
export function generateAlerts(): SystemAlert[] {
  const alerts: SystemAlert[] = [
    ...checkLiveTruth(),
    ...checkSelfHealing(),
    ...checkCurrency(),
    ...checkCatalogHealth(),
    ...checkLinkAndColombia(),
  ]

  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2))
  return alerts
}
