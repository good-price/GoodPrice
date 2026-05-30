/**
 * lib/ops/actions/action-history.ts
 *
 * Builds a per-product lifecycle timeline by merging data from:
 *   - Operational audit log (manual actions by operators)
 *   - Live-truth result store (validation events)
 *   - Healing suppression store (self-healing events)
 *   - Link health cache (link audit events)
 *   - Quarantine store (quarantine events)
 *   - Override store (manual override events)
 *
 * Returns a chronological timeline of significant events for a product.
 *
 * SERVER-ONLY.
 */

import { getProductAuditHistory }           from './audit-log'
import { getOverride }                      from './override-engine'
import { getModerationEntry }               from './moderation-engine'
import { getQuarantineEntry }               from '@/lib/audit/quarantine'
import { loadAllResults }                   from '@/lib/catalog/live-truth/reports'
import { computeLinkHealth }               from '@/lib/catalog/link-health'
import type { ProductHistoryEntry }         from './types'

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Builds a chronological timeline of events for a single product.
 * Events are sorted newest-first. Max 50 entries.
 */
export function buildProductTimeline(productId: string): ProductHistoryEntry[] {
  const events: ProductHistoryEntry[] = []

  // ── Audit log entries ──────────────────────────────────────────────────────
  const auditEntries = getProductAuditHistory(productId)
  for (const entry of auditEntries) {
    events.push({
      timestamp: entry.timestamp,
      event:     `Acción: ${entry.action}`,
      detail:    entry.success
        ? `${entry.previousState} → ${entry.nextState}${entry.reason ? ` · "${entry.reason}"` : ''}`
        : `FALLÓ: ${entry.error ?? 'error desconocido'}`,
      operator:  entry.operator,
      automated: false,
    })
  }

  // ── Quarantine events ──────────────────────────────────────────────────────
  const qEntry = getQuarantineEntry(productId)
  if (qEntry) {
    events.push({
      timestamp: qEntry.quarantinedAt,
      event:     'Cuarentena aplicada',
      detail:    `Razón: ${qEntry.reason} · Por: ${qEntry.quarantinedBy}`,
      operator:  qEntry.quarantinedBy === 'manual' ? 'operator' : null,
      automated: qEntry.quarantinedBy === 'audit',
    })
  }

  // ── Live-truth validation events ───────────────────────────────────────────
  try {
    const results = loadAllResults()
    const truth   = results[productId]
    if (truth) {
      events.push({
        timestamp: truth.checkedAt,
        event:     `Validación live-truth`,
        detail:    `Status: ${truth.status} · Truth score: ${truth.truthScore}/100${truth.hasFakeDiscount ? ' · ⚠ descuento falso' : ''}${truth.hasTitleDrift ? ' · ⚠ deriva de título' : ''}`,
        operator:  null,
        automated: true,
      })
    }
  } catch { /* unavailable */ }

  // ── Override events ────────────────────────────────────────────────────────
  const override = getOverride(productId)
  if (override) {
    events.push({
      timestamp: override.appliedAt,
      event:     `Override manual: ${override.tier}`,
      detail:    `Razón: "${override.reason}"${override.expiresAt ? ` · Expira: ${override.expiresAt}` : ''}`,
      operator:  override.operator,
      automated: false,
    })
  }

  // ── Link health events ─────────────────────────────────────────────────────
  try {
    const linkEntry = computeLinkHealth(productId)
    if (linkEntry && linkEntry.checkedAt) {
      events.push({
        timestamp: linkEntry.checkedAt,
        event:     `Auditoría de enlace Amazon`,
        detail:    `Status: ${linkEntry.status} · Fallos consecutivos: ${linkEntry.consecutiveFails}`,
        operator:  null,
        automated: true,
      })
    }
  } catch { /* unavailable */ }

  // ── Moderation notes ───────────────────────────────────────────────────────
  const modEntry = getModerationEntry(productId)
  if (modEntry) {
    // Add pinned notes as events
    for (const note of modEntry.notes.filter(n => n.pinned)) {
      events.push({
        timestamp: note.createdAt,
        event:     '📌 Nota operacional',
        detail:    note.text,
        operator:  note.operator,
        automated: false,
      })
    }
    if (modEntry.riskLevel && modEntry.flaggedAt) {
      events.push({
        timestamp: modEntry.flaggedAt,
        event:     `Nivel de riesgo: ${modEntry.riskLevel.toUpperCase()}`,
        detail:    `Marcado por: ${modEntry.flaggedBy ?? 'desconocido'}`,
        operator:  modEntry.flaggedBy,
        automated: false,
      })
    }
  }

  // Sort newest first, limit to 50
  return events
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 50)
}
