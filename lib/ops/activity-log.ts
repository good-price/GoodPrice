/**
 * lib/ops/activity-log.ts
 *
 * Builds a unified operational activity timeline by aggregating events from
 * all GOODPRICE subsystems. Pure read — never writes.
 *
 * Sources aggregated:
 *   1. lib/ops/event-bus      — custom emitted events (data/ops/events.json)
 *   2. self-healing log       — suppressions, recoveries, drift repairs
 *   3. quarantine entries     — recently quarantined products
 *   4. truth report           — last validation run timestamp
 *   5. healing schedule       — last healing cycle timestamp
 *
 * SERVER-ONLY.
 */

import { loadHealingEvents }   from '@/lib/catalog/self-healing'
import { getHealingSchedule }  from '@/lib/catalog/self-healing'
import { loadReport as loadTruthReport } from '@/lib/catalog/live-truth'
import { getQuarantine }       from '@/lib/audit/quarantine'
import { loadEmittedEvents }   from './event-bus'
import type { ActivityEvent }  from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max age of quarantine entries to surface in the log (30 days). */
const MAX_QUARANTINE_AGE_MS = 30 * 24 * 60 * 60 * 1_000

function newId(base: string): string {
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

// ── Source converters ─────────────────────────────────────────────────────────

function healingEventsToActivity(): ActivityEvent[] {
  const raw = loadHealingEvents()
  return raw.map(e => ({
    id:          newId('heal'),
    type:        (e.action === 'suppress'    ? 'product_suppressed'  :
                  e.action === 'recover'     ? 'product_recovered'   :
                  e.action === 'drift_repair'? 'drift_repair'        :
                  'custom') as ActivityEvent['type'],
    subsystem:   'self-healing' as const,
    severity:    (e.action === 'suppress'    ? 'warning' :
                  e.action === 'recover'     ? 'info'    :
                  'info') as ActivityEvent['severity'],
    title:       e.action === 'suppress'    ? `Producto suprimido (${e.asin})`  :
                 e.action === 'recover'     ? `Producto recuperado (${e.asin})` :
                 e.action === 'drift_repair'? `Corrección drift (${e.asin})`   :
                 `Evento: ${e.action}`,
    description: e.reason,
    asin:        e.asin,
    productId:   e.productId,
    data:        { truthScore: e.truthScore },
    ts:          e.ts,
  }))
}

function quarantineEventsToActivity(): ActivityEvent[] {
  const quarantine = getQuarantine()
  const cutoff     = Date.now() - MAX_QUARANTINE_AGE_MS
  return Object.values(quarantine.entries)
    .filter(q => new Date(q.quarantinedAt).getTime() > cutoff)
    .map(q => ({
      id:          newId('quar'),
      type:        'product_quarantined' as const,
      subsystem:   'quarantine' as const,
      severity:    'warning' as const,
      title:       `Cuarentena: ${q.asin}`,
      description: q.reason,
      asin:        q.asin,
      productId:   q.productId,
      data:        { score: q.score, quarantinedBy: q.quarantinedBy },
      ts:          q.quarantinedAt,
    }))
}

function validationRunToActivity(): ActivityEvent[] {
  const report = loadTruthReport()
  if (!report?.generatedAt) return []
  return [{
    id:          newId('truth'),
    type:        'validation_run' as const,
    subsystem:   'live-truth' as const,
    severity:    report.avgTruthScore < 50 ? 'warning' : 'info',
    title:       `Validación completada — ${report.totalChecked} productos`,
    description: `Score promedio: ${report.avgTruthScore}/100 · Válidos: ${report.validCount} · No disponibles: ${report.unavailableCount}`,
    data:        {
      totalChecked:    report.totalChecked,
      avgTruthScore:   report.avgTruthScore,
      validCount:      report.validCount,
      unavailableCount: report.unavailableCount,
    },
    ts:          report.generatedAt,
  }]
}

function healingCycleToActivity(): ActivityEvent[] {
  const schedule = getHealingSchedule()
  if (!schedule.lastCycleAt) return []
  return [{
    id:          newId('cycle'),
    type:        'healing_cycle' as const,
    subsystem:   'self-healing' as const,
    severity:    'info' as const,
    title:       `Ciclo de auto-reparación #${schedule.cycleCount}`,
    description: `Ciclo completado ${schedule.cycleCount > 0 ? `(${schedule.cycleCount} total)` : ''}`,
    data:        { cycleCount: schedule.cycleCount },
    ts:          schedule.lastCycleAt,
  }]
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a unified activity log from all subsystem sources.
 * Returns events sorted newest-first, capped at `limit`.
 */
export function buildActivityLog(limit = 50): ActivityEvent[] {
  const all: ActivityEvent[] = [
    ...loadEmittedEvents(),
    ...healingEventsToActivity(),
    ...quarantineEventsToActivity(),
    ...validationRunToActivity(),
    ...healingCycleToActivity(),
  ]

  // Deduplicate by id, sort newest-first
  const seen  = new Set<string>()
  const dedup = all.filter(e => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  dedup.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
  return dedup.slice(0, limit)
}
