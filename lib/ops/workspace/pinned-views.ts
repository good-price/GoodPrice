/**
 * lib/ops/workspace/pinned-views.ts
 *
 * Pinned metric definitions and value computation from OpsSnapshot.
 * Operators can choose which metrics to pin to the topbar strip.
 */

import type { MetricDef, PinnedMetricValue, MetricColor, OpsSnapshot } from './types'

// ── Metric catalogue ──────────────────────────────────────────────────────────

export const METRIC_DEFS: MetricDef[] = [
  {
    id:          'health-score',
    label:       'Health',
    description: 'Composite catalog health score (0–100)',
    category:    'health',
    unit:        '/100',
  },
  {
    id:          'visible-pct',
    label:       'Visible',
    description: 'Percentage of catalog that is publicly visible',
    category:    'visibility',
    unit:        '%',
  },
  {
    id:          'active-count',
    label:       'Active',
    description: 'Products at ACTIVE tier',
    category:    'visibility',
  },
  {
    id:          'suppressed-count',
    label:       'Suprimidos',
    description: 'Products at SUPPRESSED tier',
    category:    'visibility',
  },
  {
    id:          'degraded-count',
    label:       'Degradados',
    description: 'Products at DEGRADED tier',
    category:    'visibility',
  },
  {
    id:          'warning-count',
    label:       'Warning',
    description: 'Products at WARNING tier',
    category:    'visibility',
  },
  {
    id:          'override-count',
    label:       'Overrides',
    description: 'Products with active manual overrides',
    category:    'trust',
  },
  {
    id:          'active-jobs',
    label:       'Jobs',
    description: 'Currently active pipeline jobs',
    category:    'pipeline',
  },
  {
    id:          'system-status',
    label:       'Sistema',
    description: 'Overall system health status',
    category:    'health',
  },
]

// ── Metric color logic ────────────────────────────────────────────────────────

function healthColor(score: number): MetricColor {
  if (score >= 75) return 'green'
  if (score >= 50) return 'yellow'
  if (score >= 25) return 'red'
  return 'red'
}

function visiblePctColor(pct: number): MetricColor {
  if (pct >= 70) return 'green'
  if (pct >= 40) return 'yellow'
  return 'red'
}

function suppressedColor(count: number, total: number): MetricColor {
  if (total === 0) return 'gray'
  const pct = count / total
  if (pct >= 0.4) return 'red'
  if (pct >= 0.2) return 'yellow'
  return 'green'
}

function statusColor(status: OpsSnapshot['systemStatus']): MetricColor {
  return status === 'ok' ? 'green' : status === 'degraded' ? 'yellow' : 'red'
}

// ── Value builder ─────────────────────────────────────────────────────────────

/**
 * Computes all pinned metric values from the current OpsSnapshot.
 */
export function computeMetricValues(
  snapshot: OpsSnapshot,
): Record<string, PinnedMetricValue> {
  const v = snapshot.visibility

  return {
    'health-score': {
      id:         'health-score',
      label:      'Health',
      value:      snapshot.healthScore,
      unit:       '/100',
      color:      healthColor(snapshot.healthScore),
      trend:      'unknown',
    },
    'visible-pct': {
      id:         'visible-pct',
      label:      'Visible',
      value:      Math.round(v.visiblePct),
      unit:       '%',
      color:      visiblePctColor(v.visiblePct),
      trend:      'unknown',
    },
    'active-count': {
      id:         'active-count',
      label:      'Active',
      value:      v.active,
      color:      v.active > 0 ? 'green' : 'gray',
      trend:      'unknown',
    },
    'suppressed-count': {
      id:         'suppressed-count',
      label:      'Suprimidos',
      value:      v.suppressed,
      color:      suppressedColor(v.suppressed, v.total),
      trend:      'unknown',
    },
    'degraded-count': {
      id:         'degraded-count',
      label:      'Degradados',
      value:      v.degraded,
      color:      v.degraded > 0 ? 'yellow' : 'green',
      trend:      'unknown',
    },
    'warning-count': {
      id:         'warning-count',
      label:      'Warning',
      value:      v.warning,
      color:      v.warning > 0 ? 'yellow' : 'green',
      trend:      'unknown',
    },
    'override-count': {
      id:         'override-count',
      label:      'Overrides',
      value:      snapshot.overrideCount,
      color:      snapshot.overrideCount > 0 ? 'blue' : 'gray',
      trend:      'unknown',
    },
    'active-jobs': {
      id:         'active-jobs',
      label:      'Jobs',
      value:      snapshot.activeJobCount,
      color:      snapshot.activeJobCount > 0 ? 'purple' : 'gray',
      trend:      'unknown',
    },
    'system-status': {
      id:         'system-status',
      label:      'Sistema',
      value:      snapshot.systemStatus === 'ok' ? 'OK'
                    : snapshot.systemStatus === 'degraded' ? 'Degraded'
                    : 'Critical',
      color:      statusColor(snapshot.systemStatus),
      trend:      'unknown',
    },
  }
}

/**
 * Returns metric values for a specific set of metric IDs.
 */
export function getPinnedMetricValues(
  ids: string[],
  snapshot: OpsSnapshot,
): PinnedMetricValue[] {
  const all = computeMetricValues(snapshot)
  return ids
    .filter(id => id in all)
    .map(id => all[id])
}
