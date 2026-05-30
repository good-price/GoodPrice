/**
 * lib/ops/timeline.ts
 *
 * Builds a chronological operational event feed suitable for admin display.
 * Combines activity log events with alerts and anomaly detections into a
 * single sorted timeline.
 *
 * SERVER-ONLY.
 */

import { buildActivityLog }  from './activity-log'
import { generateAlerts }    from './alert-engine'
import { detectAnomalies }   from './anomaly-engine'
import type { ActivityEvent } from './types'

// ── Alert / anomaly → ActivityEvent conversion ────────────────────────────────

import type { SystemAlert, Anomaly } from './types'

function alertToEvent(alert: SystemAlert): ActivityEvent {
  return {
    id:          `alert-${alert.id}`,
    type:        'custom',
    subsystem:   'ops',
    severity:    alert.severity,
    title:       `[ALERTA] ${alert.title}`,
    description: alert.description,
    data:        { suggestion: alert.suggestion },
    ts:          alert.triggeredAt,
  }
}

function anomalyToEvent(anomaly: Anomaly): ActivityEvent {
  return {
    id:          `anomaly-${anomaly.type}-${Date.now()}`,
    type:        'custom',
    subsystem:   'ops',
    severity:    anomaly.severity,
    title:       `[ANOMALÍA] ${anomaly.type.replace(/_/g, ' ')}`,
    description: anomaly.description,
    data:        { value: anomaly.value, threshold: anomaly.threshold },
    ts:          anomaly.detectedAt,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface TimelineOptions {
  /** Max events to return (default: 30). */
  limit?:              number
  /** Include alert events in the timeline (default: true). */
  includeAlerts?:      boolean
  /** Include anomaly events in the timeline (default: true). */
  includeAnomalies?:   boolean
  /** Only return events with severity >= this level. */
  minSeverity?:        'info' | 'warning' | 'critical'
  /** Only return events from this subsystem. */
  subsystem?:          string
}

/**
 * Build a unified sorted operational timeline.
 * Newest events first.
 */
export function buildTimeline(opts: TimelineOptions = {}): ActivityEvent[] {
  const {
    limit           = 30,
    includeAlerts   = true,
    includeAnomalies = true,
    minSeverity     = 'info',
    subsystem,
  } = opts

  const activityLog = buildActivityLog(200)

  const all: ActivityEvent[] = [...activityLog]

  if (includeAlerts) {
    const alerts = generateAlerts()
    all.push(...alerts.map(alertToEvent))
  }

  if (includeAnomalies) {
    const anomalies = detectAnomalies(activityLog)
    all.push(...anomalies.map(anomalyToEvent))
  }

  // Deduplicate by id
  const seen   = new Set<string>()
  const dedup  = all.filter(e => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  // Filter by severity
  const severityOrder = { info: 0, warning: 1, critical: 2 }
  const minLevel = severityOrder[minSeverity]
  const filtered = dedup.filter(e => {
    if ((severityOrder[e.severity] ?? 0) < minLevel) return false
    if (subsystem && e.subsystem !== subsystem) return false
    return true
  })

  // Sort newest-first
  filtered.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())

  return filtered.slice(0, limit)
}
