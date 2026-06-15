/**
 * lib/ops/delete-product.ts
 *
 * Permanent product deletion engine.
 *
 * Removes a product from every operational store and marks it in the
 * deleted-products filter so the public catalog and OPS views hide it
 * immediately without requiring changes to the TypeScript source files.
 *
 * The audit trail in audit-log.json is NEVER purged — it is the
 * forensic record of the deletion and must be preserved indefinitely.
 *
 * This operation is IRREVERSIBLE.
 *
 * SERVER-ONLY.
 */

import {
  existsSync, mkdirSync, readFileSync,
  writeFileSync, renameSync, unlinkSync,
} from 'fs'
import { dirname, join }                from 'path'
import { getRawProducts }               from '@/data/catalog'
import { dataPath }                     from '@/lib/data-path'
import { getQuarantineEntry, unquarantineProduct } from '@/lib/audit/quarantine'
import { removeOverride }               from '@/lib/ops/actions/override-engine'
import { appendAuditEntry }             from '@/lib/ops/actions/audit-log'
import { markProductDeleted }           from '@/lib/catalog/deleted-products'
import { loadColombiaCache, saveColombiaCache }     from '@/lib/catalog/colombia-availability'
import { loadLinkHealthCache, saveLinkHealthCache } from '@/lib/catalog/link-health'
import { loadResultStore, loadQueue, saveQueue }    from '@/lib/catalog/live-truth/reports'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeleteRequest {
  productId:    string
  confirmation: string  // must equal 'ELIMINAR'
  operator:     string
  reason:       string
}

export interface DeleteResult {
  ok:            boolean
  productId:     string
  asin:          string
  title:         string
  category:      string
  tier:          string
  storesCleared: string[]
  auditId:       string
  error?:        'INVALID_CONFIRMATION' | 'PRODUCT_NOT_FOUND' | 'RECALL_PROTECTED'
  errorDetail?:  string
}

// ── Atomic JSON write helper ──────────────────────────────────────────────────

function atomicWrite(filePath: string, data: unknown): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = filePath + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, filePath)
}

// ── Core deletion ──────────────────────────────────────────────────────────────

export function performProductDeletion(req: DeleteRequest): DeleteResult {
  const { productId, confirmation, operator, reason } = req

  // ── Guard: confirmation string ─────────────────────────────────────────────
  if (confirmation !== 'ELIMINAR') {
    return makeErr(productId, 'INVALID_CONFIRMATION', 'La confirmación debe ser exactamente "ELIMINAR"')
  }

  // ── Guard: product must exist ──────────────────────────────────────────────
  const raw = getRawProducts().find(p => p.id === productId)
  if (!raw) {
    return makeErr(productId, 'PRODUCT_NOT_FOUND', `Producto "${productId}" no encontrado`)
  }

  const { asin, title, category } = raw
  const tier = raw.status as string

  // ── Guard: CPSC recall protection ─────────────────────────────────────────
  const qEntry = getQuarantineEntry(productId)
  if (qEntry?.reason.includes('RECALL CPSC')) {
    return makeErr(
      productId, 'RECALL_PROTECTED',
      `"${title}" está en cuarentena por RECALL CPSC activo. ` +
      'No puede eliminarse directamente — consultar asesor legal.',
      asin, title, category, tier,
    )
  }

  const storesCleared: string[] = []

  // ── 1. Quarantine store ────────────────────────────────────────────────────
  try {
    if (unquarantineProduct(productId)) storesCleared.push('quarantine.json')
  } catch { /* missing — ok */ }

  // ── 2. Overrides store ─────────────────────────────────────────────────────
  try {
    if (removeOverride(productId)) storesCleared.push('overrides.json')
  } catch { /* missing — ok */ }

  // ── 3. Colombia availability cache ─────────────────────────────────────────
  try {
    const cache = loadColombiaCache()
    if (cache && productId in cache.entries) {
      delete cache.entries[productId]
      saveColombiaCache(cache)
      storesCleared.push('colombia-availability.json')
    }
  } catch { /* missing — ok */ }

  // ── 4. Link health cache ───────────────────────────────────────────────────
  try {
    const cache = loadLinkHealthCache()
    if (cache && productId in cache.entries) {
      delete cache.entries[productId]
      saveLinkHealthCache(cache)
      storesCleared.push('link-health.json')
    }
  } catch { /* missing — ok */ }

  // ── 5. Live-truth results.json ─────────────────────────────────────────────
  try {
    const store = loadResultStore()
    if (productId in store.results) {
      delete store.results[productId]
      store.updatedAt = new Date().toISOString()
      atomicWrite(join(dataPath('data', 'catalog', 'live-truth'), 'results.json'), store)
      storesCleared.push('live-truth/results.json')
    }
  } catch { /* missing — ok */ }

  // ── 6. Live-truth validation queue ────────────────────────────────────────
  try {
    const queue = loadQueue()
    const before = queue.items.length
    queue.items = queue.items.filter(item => item.productId !== productId)
    if (queue.items.length !== before) {
      queue.updatedAt = new Date().toISOString()
      saveQueue(queue)
      storesCleared.push('live-truth/queue.json')
    }
  } catch { /* missing — ok */ }

  // ── 7. Moderation store (notes, risk levels) ──────────────────────────────
  try {
    const modPath = dataPath('data', 'ops', 'actions', 'moderation.json')
    if (existsSync(modPath)) {
      const store = JSON.parse(readFileSync(modPath, 'utf8')) as {
        updatedAt: string
        entries:   Record<string, unknown>
      }
      if (productId in store.entries) {
        delete store.entries[productId]
        store.updatedAt = new Date().toISOString()
        atomicWrite(modPath, store)
        storesCleared.push('moderation.json')
      }
    }
  } catch { /* missing — ok */ }

  // ── 8. Per-product pricing files ──────────────────────────────────────────
  for (const segment of ['snapshots', 'offers'] as const) {
    const p = dataPath('data', 'pricing', segment, `${productId}.json`)
    try {
      if (existsSync(p)) {
        unlinkSync(p)
        storesCleared.push(`pricing/${segment}/${productId}.json`)
      }
    } catch { /* skip */ }
  }

  // ── 9. Runtime catalog exclusion filter ───────────────────────────────────
  markProductDeleted({ productId, asin, title, category, tier, operator, reason })
  storesCleared.push('deleted-products.json')

  // ── 10. Forensic audit entry — audit-log is NEVER purged ─────────────────
  const entry = appendAuditEntry(
    productId,
    asin,
    title,
    'permanent-delete',
    operator,
    reason,
    `tier:${tier} | category:${category} | asin:${asin}`,
    'ELIMINADO PERMANENTEMENTE — registro forense preservado',
    true,
  )

  return { ok: true, productId, asin, title, category, tier, storesCleared, auditId: entry.id }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function makeErr(
  productId:   string,
  error:       DeleteResult['error'],
  errorDetail: string,
  asin        = '',
  title       = '',
  category    = '',
  tier        = '',
): DeleteResult {
  return {
    ok: false,
    productId,
    asin,
    title,
    category,
    tier,
    storesCleared: [],
    auditId:       '',
    error,
    errorDetail,
  }
}
