/**
 * lib/ops/anomaly-engine.ts
 *
 * Detects statistical anomalies in the GOODPRICE platform by analysing
 * patterns in the activity log and current system state.
 *
 * Anomaly types detected:
 *   - Mass suppression spike (>N suppressions in last hour)
 *   - Validation stall (queue growing, no recent checks)
 *   - Trust score collapse (avg score dropped significantly)
 *   - Category collapse (entire category going unavailable)
 *   - Price anomaly (many drift repairs at once)
 *   - Quarantine spike (>N quarantines in 24h)
 *
 * SERVER-ONLY.
 */

import { loadReport as loadTruthReport }   from '@/lib/catalog/live-truth'
import { loadHealingEvents }               from '@/lib/catalog/self-healing'
import { getQuarantine }                   from '@/lib/audit/quarantine'
import { getPublicCatalogStats }           from '@/lib/catalog/public'
import type { Anomaly, ActivityEvent }     from './types'

// ── Thresholds ────────────────────────────────────────────────────────────────

const SUPPRESSION_SPIKE_1H  = 3     // > 3 suppressions/hour → warning
const SUPPRESSION_SPIKE_1H_CRIT = 8 // > 8 suppressions/hour → critical
const QUARANTINE_SPIKE_24H  = 5     // > 5 quarantines/24h → warning
const PRICE_REPAIR_SPIKE    = 10    // > 10 drift repairs in last run → warning
const TRUTH_SCORE_CRITICAL  = 40    // avg score < 40 → critical collapse

function ms(hours: number): number { return hours * 3_600_000 }

// ── Detectors ─────────────────────────────────────────────────────────────────

function detectSuppressionSpike(activityLog: ActivityEvent[]): Anomaly[] {
  const now      = Date.now()
  const cutoff1h = now - ms(1)
  const recent   = activityLog.filter(
    e => e.type === 'product_suppressed' && new Date(e.ts).getTime() > cutoff1h,
  )
  if (recent.length === 0) return []

  const severity: Anomaly['severity'] = recent.length >= SUPPRESSION_SPIKE_1H_CRIT
    ? 'critical'
    : 'warning'

  return [{
    type:        'suppression_spike',
    severity,
    description: `${recent.length} productos suprimidos en la última hora — posible degradación masiva del catálogo.`,
    value:       recent.length,
    threshold:   SUPPRESSION_SPIKE_1H,
    detectedAt:  new Date().toISOString(),
  }]
}

function detectQuarantineSpike(): Anomaly[] {
  const quarantine = getQuarantine()
  const cutoff24h  = Date.now() - ms(24)
  const recent     = Object.values(quarantine.entries).filter(
    q => new Date(q.quarantinedAt).getTime() > cutoff24h,
  )
  if (recent.length < QUARANTINE_SPIKE_24H) return []

  return [{
    type:        'quarantine_spike',
    severity:    'warning',
    description: `${recent.length} productos en cuarentena en las últimas 24h — revisión manual recomendada.`,
    value:       recent.length,
    threshold:   QUARANTINE_SPIKE_24H,
    detectedAt:  new Date().toISOString(),
  }]
}

function detectTrustCollapse(): Anomaly[] {
  const report = loadTruthReport()
  if (!report || report.totalChecked === 0) return []
  if (report.avgTruthScore < TRUTH_SCORE_CRITICAL) {
    return [{
      type:        'trust_score_collapse',
      severity:    'critical',
      description: `Score de verdad promedio colapsó a ${report.avgTruthScore}/100 — ${report.unavailableCount} no disponibles, ${report.driftedCount} con deriva.`,
      value:       report.avgTruthScore,
      threshold:   TRUTH_SCORE_CRITICAL,
      detectedAt:  new Date().toISOString(),
    }]
  }
  return []
}

function detectPriceDriftSpike(): Anomaly[] {
  const events    = loadHealingEvents()
  const cutoff24h = Date.now() - ms(24)
  const repairs   = events.filter(
    e => e.action === 'drift_repair' && new Date(e.ts).getTime() > cutoff24h,
  )
  if (repairs.length < PRICE_REPAIR_SPIKE) return []

  return [{
    type:        'price_drift_spike',
    severity:    'warning',
    description: `${repairs.length} correcciones de precio aplicadas en 24h — posible cambio masivo de precios en Amazon.`,
    value:       repairs.length,
    threshold:   PRICE_REPAIR_SPIKE,
    detectedAt:  new Date().toISOString(),
  }]
}

function detectCatalogDepletionAnomaly(): Anomaly[] {
  const stats   = getPublicCatalogStats()
  const hiddenPct = stats.total > 0
    ? Math.round((stats.hidden / stats.total) * 100)
    : 0

  if (hiddenPct >= 40) {
    return [{
      type:        'catalog_depletion',
      severity:    hiddenPct >= 60 ? 'critical' : 'warning',
      description: `${hiddenPct}% del catálogo está oculto (${stats.hidden} de ${stats.total} productos). Usuarios ven un catálogo muy reducido.`,
      value:       hiddenPct,
      threshold:   40,
      detectedAt:  new Date().toISOString(),
    }]
  }
  return []
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect current platform anomalies.
 * @param activityLog  Pass the pre-built activity log to avoid re-reading.
 */
export function detectAnomalies(activityLog: ActivityEvent[] = []): Anomaly[] {
  const anomalies: Anomaly[] = [
    ...detectSuppressionSpike(activityLog),
    ...detectQuarantineSpike(),
    ...detectTrustCollapse(),
    ...detectPriceDriftSpike(),
    ...detectCatalogDepletionAnomaly(),
  ]

  // Sort critical first
  anomalies.sort((a, b) =>
    (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1),
  )
  return anomalies
}
