/**
 * lib/catalog/alerts/state.ts
 *
 * Alert store persistence — Sprint 4F.
 *
 * Persists to data/catalog/alerts.json.
 * OPS V3 atomic write (tmp → rename).
 * Fault-tolerant reads — never throw.
 *
 * generateAlerts():
 *   Reads lifecycle + intelligence stores.
 *   Evaluates alert conditions for each product.
 *   Skips if an identical unresolved alert already exists (dedup).
 *   Single atomic write.
 *
 * SERVER-ONLY.
 */

import path from 'path'
import { storage } from '@/lib/storage/StorageFactory'
import { getRuntimeProducts }       from '@/lib/catalog/runtime/reader'
import { readLifecycleStore }       from '@/lib/catalog/lifecycle/state'
import { readProductIntelligence }  from '@/lib/catalog/pricing-memory/state'
import {
  evaluateAlertConditions,
  alertDedupKey,
  buildAlert,
} from './engine'
import type { AlertStore, ProductAlert, AlertType } from './types'

const ALERTS_FILE = path.resolve(process.cwd(), 'data/catalog/alerts.json')

// ── Atomic write ──────────────────────────────────────────────────────────────

function atomicWrite(filePath: string, content: string): void {
  const tmp = filePath + '.tmp'
  storage.write(tmp, content)
  storage.rename(tmp, filePath)
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function defaultStore(): AlertStore {
  return { updatedAt: null, alerts: {} }
}

// ── Migration ─────────────────────────────────────────────────────────────────

function migrateStore(raw: unknown): AlertStore {
  if (!raw || typeof raw !== 'object') return defaultStore()
  const r = raw as Record<string, unknown>

  const alerts: Record<string, ProductAlert> = {}
  const rawAlerts = r['alerts']
  if (rawAlerts && typeof rawAlerts === 'object' && !Array.isArray(rawAlerts)) {
    for (const [id, v] of Object.entries(rawAlerts as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const a = v as Record<string, unknown>

      const type     = a['type']
      const severity = a['severity']

      const validTypes: AlertType[] = ['price-drop', 'high-opportunity', 'critical-lifecycle', 'low-confidence', 'replacement-needed']
      const validType = validTypes.includes(type as AlertType) ? type as AlertType : 'low-confidence'

      const validSeverity = severity === 'low' || severity === 'medium' || severity === 'high'
        ? severity as ProductAlert['severity']
        : 'low'

      alerts[id] = {
        id:         typeof a['id']         === 'string' ? a['id']         : id,
        asin:       typeof a['asin']       === 'string' ? a['asin']       : '',
        category:   typeof a['category']   === 'string' ? a['category']   : '',
        type:       validType,
        severity:   validSeverity,
        message:    typeof a['message']    === 'string' ? a['message']    : '',
        createdAt:  typeof a['createdAt']  === 'string' ? a['createdAt']  : new Date().toISOString(),
        resolvedAt: typeof a['resolvedAt'] === 'string' ? a['resolvedAt'] : null,
      }
    }
  }

  return {
    updatedAt: typeof r['updatedAt'] === 'string' ? r['updatedAt'] : null,
    alerts,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function readAlerts(): AlertStore {
  try {
    const raw = storage.read(ALERTS_FILE)
    if (raw === null) return defaultStore()
    return migrateStore(JSON.parse(raw))
  } catch {
    return defaultStore()
  }
}

export function saveAlerts(store: AlertStore): void {
  try {
    atomicWrite(ALERTS_FILE, JSON.stringify(store, null, 2))
  } catch {
    // best-effort
  }
}

export function resolveAlert(alertId: string): void {
  try {
    const store = readAlerts()
    const alert = store.alerts[alertId]
    if (!alert || alert.resolvedAt !== null) return
    store.alerts[alertId] = { ...alert, resolvedAt: new Date().toISOString() }
    store.updatedAt = new Date().toISOString()
    saveAlerts(store)
  } catch {
    // best-effort
  }
}

/**
 * Generates alerts for all products in the runtime catalog.
 *
 * Dedup: for each ASIN+type combination, if an unresolved alert already
 * exists, no new alert is created. This prevents alert flooding across
 * repeated pipeline runs.
 *
 * @returns number of new alerts created.
 */
export function generateAlerts(): number {
  try {
    const now          = new Date().toISOString()
    const store        = readAlerts()
    const lifecycle    = readLifecycleStore()
    const intelligence = readProductIntelligence()
    const runtimeProds = getRuntimeProducts()

    // Build dedup set: active alert keys (asin:type for unresolved)
    const activeKeys = new Set<string>()
    for (const alert of Object.values(store.alerts)) {
      if (alert.resolvedAt === null) {
        activeKeys.add(alertDedupKey(alert.asin, alert.type))
      }
    }

    let newAlerts = 0

    for (const product of runtimeProds) {
      const lc    = lifecycle.products[product.asin]
      const intel = intelligence.products[product.asin]

      const pending = evaluateAlertConditions({
        asin:             product.asin,
        category:         product.category,
        trend:            intel?.trend            ?? 'stable',
        opportunityScore: intel?.opportunityScore ?? 0,
        confidenceScore:  lc?.confidenceScore     ?? 0,
        lifecycleHealth:  lc?.health              ?? 'stale',
        needsReplacement: lc?.needsReplacement    ?? false,
      })

      for (const p of pending) {
        const key = alertDedupKey(product.asin, p.type)
        if (activeKeys.has(key)) continue  // dedup: already active

        const alert = buildAlert(product.asin, product.category, p, now)
        store.alerts[alert.id] = alert
        activeKeys.add(key)
        newAlerts++
      }
    }

    store.updatedAt = now
    saveAlerts(store)
    return newAlerts
  } catch {
    return 0
  }
}
