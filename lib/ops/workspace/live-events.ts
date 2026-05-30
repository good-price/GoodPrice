/**
 * lib/ops/workspace/live-events.ts
 *
 * Aggregates live operational events from existing data sources and
 * normalises them into the workspace LiveEvent format.
 *
 * Sources:
 *   1. ops/actions audit log   → operator actions on products
 *   2. ops/execution log       → pipeline runs, job completions
 *   3. ops/activity log        → healing events, quarantine changes
 *
 * SERVER-ONLY — reads from disk, never writes.
 */

import { getRecentAuditEntries }         from '@/lib/ops/actions/audit-log'
import { getRecentLog }                  from '@/lib/ops/execution/execution-log'
import { buildActivityLog }              from '@/lib/ops/activity-log'
import type { LiveEvent, LiveEventType, LiveEventLevel } from './types'

// ── Audit → LiveEvent ─────────────────────────────────────────────────────────

const ACTION_LEVEL: Record<string, LiveEventLevel> = {
  activate:        'success',
  restore:         'success',
  unquarantine:    'success',
  downgrade:       'warning',
  suppress:        'warning',
  quarantine:      'error',
  archive:         'error',
  repair:          'info',
  revalidate:      'info',
  'refresh-truth': 'info',
  'refresh-pricing': 'info',
  'rerun-repair':  'info',
}

const ACTION_TYPE: Record<string, LiveEventType> = {
  activate:        'action_executed',
  restore:         'action_executed',
  unquarantine:    'quarantine_change',
  downgrade:       'action_executed',
  suppress:        'suppression_triggered',
  quarantine:      'quarantine_change',
  archive:         'action_executed',
  repair:          'repair_applied',
  revalidate:      'action_executed',
  'refresh-truth': 'action_executed',
  'refresh-pricing': 'action_executed',
  'rerun-repair':  'repair_applied',
}

function auditToLiveEvents(limit: number): LiveEvent[] {
  try {
    const entries = getRecentAuditEntries(limit)
    return entries.map(e => ({
      id:           `audit-${e.id}`,
      type:         (ACTION_TYPE[e.action] ?? 'action_executed') as LiveEventType,
      title:        `${e.action.charAt(0).toUpperCase() + e.action.slice(1)}: ${e.title}`,
      detail:       e.reason,
      timestamp:    e.timestamp,
      level:        e.success
                      ? ((ACTION_LEVEL[e.action] ?? 'info') as LiveEventLevel)
                      : 'error',
      productId:    e.productId,
      productTitle: e.title,
      operator:     e.operator,
      source:       'action' as const,
    }))
  } catch {
    return []
  }
}

// ── Execution log → LiveEvent ─────────────────────────────────────────────────

const JOB_TYPE_MAP: Record<string, string> = {
  'trust-recompute':   'Trust Recompute',
  'repair':            'Repair Pipeline',
  'live-truth':        'Live Truth',
  'link-audit':        'Link Audit',
  'colombia-audit':    'Colombia Audit',
  'self-healing':      'Self-Healing',
  'paapi-sync':        'PA-API Sync',
  'recovery-pipeline': 'Recovery Pipeline',
}

function execLogToLiveEvents(limit: number): LiveEvent[] {
  try {
    const entries = getRecentLog(limit)
    return entries.map(e => ({
      id:        `exec-${e.id}`,
      type:      (e.status === 'completed' ? 'job_completed' : 'job_failed') as LiveEventType,
      title:     `${JOB_TYPE_MAP[e.jobType] ?? e.jobType}: ${e.status}`,
      detail:    e.summary ?? `${e.affected} productos afectados${e.warnings.length ? ` · ${e.warnings.length} avisos` : ''}`,
      timestamp: e.completedAt ?? e.startedAt,
      level:     (e.status === 'completed' ? 'success' : 'error') as LiveEventLevel,
      operator:  e.operator,
      source:    'execution' as const,
    }))
  } catch {
    return []
  }
}

// ── Activity log → LiveEvent ──────────────────────────────────────────────────

const ACTIVITY_LEVEL: Record<string, LiveEventLevel> = {
  info:     'info',
  warning:  'warning',
  critical: 'error',
}

const ACTIVITY_TYPE: Record<string, LiveEventType> = {
  product_suppressed:    'suppression_triggered',
  product_recovered:     'recovery_completed',
  drift_repair:          'repair_applied',
  product_quarantined:   'quarantine_change',
  healing_cycle:         'healing_cycle',
  validation_run:        'action_executed',
  validation_failure:    'validation_failed',
}

function activityToLiveEvents(limit: number): LiveEvent[] {
  try {
    const log = buildActivityLog()
    return log.slice(0, limit).map(e => ({
      id:           `activity-${e.id}`,
      type:         (ACTIVITY_TYPE[e.type] ?? 'action_executed') as LiveEventType,
      title:        e.title,
      detail:       e.description,
      timestamp:    e.ts,
      level:        (ACTIVITY_LEVEL[e.severity] ?? 'info') as LiveEventLevel,
      productId:    e.productId,
      operator:     'system',
      source:       'automation' as const,
    }))
  } catch {
    return []
  }
}

// ── Merge + sort ──────────────────────────────────────────────────────────────

/**
 * Returns recent workspace live events from all sources, merged and sorted newest-first.
 */
export function getWorkspaceLiveEvents(limit = 20): LiveEvent[] {
  const perSource = Math.ceil(limit / 2)
  const all = [
    ...auditToLiveEvents(perSource),
    ...execLogToLiveEvents(perSource),
    ...activityToLiveEvents(perSource),
  ]

  // Sort newest-first, deduplicate by id
  const seen  = new Set<string>()
  const deduped: LiveEvent[] = []
  for (const e of all) {
    if (!seen.has(e.id)) {
      seen.add(e.id)
      deduped.push(e)
    }
  }

  return deduped
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit)
}

/**
 * Returns events newer than a given ISO timestamp.
 */
export function getEventsSince(since: string, limit = 50): LiveEvent[] {
  const cutoff = new Date(since).getTime()
  return getWorkspaceLiveEvents(limit).filter(
    e => new Date(e.timestamp).getTime() > cutoff,
  )
}
