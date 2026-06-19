/**
 * lib/ops/automation/registry.ts
 *
 * Canonical registry of all GOODPRICE OPS V3 automations.
 *
 * Automation taxonomy:
 *
 *   cycle-3am       — Master cycle at 03:00 AM Bogota. Runs all 6 stages.
 *   trust-recompute — On-demand recompute (runs as cycle stage 1, or standalone).
 *   live-truth      — On-demand live validation (cycle stage 3, or standalone).
 *   link-audit      — On-demand link check (cycle stage 4, or standalone).
 *   colombia-audit  — On-demand Colombia availability (cycle stage 5, or standalone).
 *   repair          — On-demand catalog repair (cycle stage 6, or standalone).
 *   trm-update      — TRM (Tasa Representativa del Mercado) exchange-rate sync.
 *                     Worker not yet registered — automation enabled but will fail
 *                     gracefully until worker is wired.
 *
 * SERVER-ONLY.
 */

import type { AutomationDefinition } from './types'

// ── Default automations ───────────────────────────────────────────────────────

export const DEFAULT_AUTOMATIONS: AutomationDefinition[] = [
  // ── Master Cycle — scheduled at 03:00 AM Bogota ───────────────────────────
  {
    id:           'cycle-3am',
    enabled:      true,
    intervalMs:   null,
    scheduledHour: 3,
    timezone:     'America/Bogota',
    jobType:      'cycle-3am',
  },

  // ── Individual job automations — on-demand (no independent schedule) ───────
  {
    id:        'trust-recompute',
    enabled:   true,
    intervalMs: null,
    jobType:   'trust-recompute',
  },
  {
    id:        'live-truth',
    enabled:   true,
    intervalMs: null,
    jobType:   'live-truth',
  },
  {
    id:        'link-audit',
    enabled:   true,
    intervalMs: null,
    jobType:   'link-audit',
  },
  {
    id:        'colombia-audit',
    enabled:   true,
    intervalMs: null,
    jobType:   'colombia-audit',
  },
  {
    id:        'repair',
    enabled:   true,
    intervalMs: null,
    jobType:   'repair',
  },

  // ── TRM — registered, worker pending ─────────────────────────────────────
  {
    id:        'trm-update',
    enabled:   true,
    intervalMs: null,
    jobType:   'trm-update',
  },
]

// ── Registry API ──────────────────────────────────────────────────────────────

export function getAutomation(id: string): AutomationDefinition | null {
  return DEFAULT_AUTOMATIONS.find(a => a.id === id) ?? null
}

export function getAllAutomations(): AutomationDefinition[] {
  return DEFAULT_AUTOMATIONS.slice()
}

export function getEnabledAutomations(): AutomationDefinition[] {
  return DEFAULT_AUTOMATIONS.filter(a => a.enabled)
}
