/**
 * lib/catalog/audit/daily-audit.ts
 *
 * Daily health check for all active catalog products.
 *
 * For each active product, runs gates 1-5 of the Candidate Validator
 * (HTTP, robot-check, price, image, availability). Products that fail
 * a suppression-worthy gate are written to status-overrides.json and
 * hidden from the public catalog. Products that recover are removed.
 *
 * Suppression-worthy failures (permanent until resolved):
 *   unavailable    → G5: product is unavailable on Amazon
 *   invalid_asin   → G1: HTTP 404 (ASIN no longer exists)
 *   image_missing  → G4: no product image found
 *   price_missing  → G3: no price extractable
 *
 * Transient failures (NOT suppressed — retry next day):
 *   robot_check, http_error (non-404), network timeout, rating_not_found
 */

import { getRawProducts } from '@/data/catalog'
import { validateCandidate } from '@/lib/catalog/candidate/validator'
import { suppressProduct, recoverProduct, isProductSuppressed } from '@/lib/catalog/status-overrides'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { dirname } from 'path'
import { dataPath } from '@/lib/data-path'
import type { OverrideReason } from '@/lib/catalog/status-overrides'
import type { DailyAuditResult, DailyAuditLog, AuditProductDetail } from './types'

// ── Audit log I/O ─────────────────────────────────────────────────────────────

const AUDIT_LOG_PATH = dataPath('data', 'catalog', 'audit-log.json')
const MAX_AUDIT_RUNS = 30  // keep last 30 runs (~1 month)

function readAuditLog(): DailyAuditLog {
  if (!existsSync(AUDIT_LOG_PATH)) return { updatedAt: '', runs: [] }
  try {
    return JSON.parse(readFileSync(AUDIT_LOG_PATH, 'utf8')) as DailyAuditLog
  } catch {
    return { updatedAt: '', runs: [] }
  }
}

function appendAuditLog(result: DailyAuditResult): void {
  const log = readAuditLog()
  log.runs.push(result)
  if (log.runs.length > MAX_AUDIT_RUNS) log.runs = log.runs.slice(-MAX_AUDIT_RUNS)
  log.updatedAt = result.runAt
  const dir = dirname(AUDIT_LOG_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = AUDIT_LOG_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(log, null, 2), 'utf8')
  renameSync(tmp, AUDIT_LOG_PATH)
}

// ── Failure reason mapping ────────────────────────────────────────────────────

/**
 * Maps a validator rejection reason to a suppression reason, or null if the
 * failure is transient (robot check, non-404 HTTP error, parser failure).
 * Only suppression-worthy failures trigger auto-inactivation.
 */
function toOverrideReason(validatorReason: string): OverrideReason | null {
  if (validatorReason.startsWith('http_error:')) {
    // Only HTTP 404 = definitive ASIN gone; other codes are transient infrastructure noise
    return validatorReason.includes('404') ? 'invalid_asin' : null
  }
  if (validatorReason === 'no_price')  return 'price_missing'
  if (validatorReason === 'no_image')  return 'image_missing'
  if (validatorReason.startsWith('unavailable:')) return 'unavailable'
  return null   // robot_check, rating_not_found, review_count_not_found, etc. → transient
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Runs the daily health audit against all active products.
 * Adds/removes entries in status-overrides.json based on results.
 * Appends a summary to data/catalog/audit-log.json.
 *
 * Uses lenient thresholds (minRating=0, minReviews=0, price 0–999999) so
 * only gates 1-5 (HTTP, robot check, price, image, availability) can fail.
 * Gates 7-9 are quality gates evaluated only at initial admission time.
 */
export async function runDailyAudit(): Promise<DailyAuditResult> {
  const t0    = Date.now()
  const runAt = new Date().toISOString()

  // Active products only — unverified and inactive are excluded
  const products = getRawProducts().filter(p => p.status === 'active')

  const details: AuditProductDetail[] = []
  let healthy = 0, unhealthy = 0, transient = 0
  let newlySuppressed = 0, recovered = 0, alreadySuppressed = 0

  // Lenient config: skip quality gates 7-9
  const HEALTH_CONFIG = { minRating: 0, minReviews: 0, minPrice: 0, maxPrice: 999_999 }

  for (const product of products) {
    const t1     = Date.now()
    const wasSuppressed = isProductSuppressed(product.id)

    try {
      const result = await validateCandidate(product.asin, HEALTH_CONFIG)
      const gatesFailed = result.gates.filter(g => !g.passed).map(g => `G${g.gate}`)

      if (result.decision === 'APPROVED') {
        // Product is healthy
        healthy++
        if (wasSuppressed) {
          recoverProduct(product.id)
          recovered++
        }
        details.push({
          productId:       product.id,
          asin:            product.asin,
          healthy:         true,
          gatesFailed:     [],
          newlySuppressed: false,
          recovered:       wasSuppressed,
          durationMs:      Date.now() - t1,
        })
      } else {
        // Product failed — determine if suppression-worthy
        const overrideReason = result.reason ? toOverrideReason(result.reason) : null

        if (overrideReason) {
          unhealthy++
          suppressProduct(product.id, product.asin, overrideReason, gatesFailed)
          if (wasSuppressed) {
            alreadySuppressed++
          } else {
            newlySuppressed++
          }
          details.push({
            productId:       product.id,
            asin:            product.asin,
            healthy:         false,
            failReason:      overrideReason,
            gatesFailed,
            newlySuppressed: !wasSuppressed,
            recovered:       false,
            durationMs:      Date.now() - t1,
          })
        } else {
          // Transient failure — do not suppress, do not recover
          transient++
          details.push({
            productId:       product.id,
            asin:            product.asin,
            healthy:         false,
            failReason:      'transient',
            gatesFailed,
            newlySuppressed: false,
            recovered:       false,
            durationMs:      Date.now() - t1,
          })
        }
      }
    } catch {
      // Network / unexpected error — treat as transient
      transient++
      details.push({
        productId:       product.id,
        asin:            product.asin,
        healthy:         false,
        failReason:      'transient',
        gatesFailed:     ['exception'],
        newlySuppressed: false,
        recovered:       false,
        durationMs:      Date.now() - t1,
      })
    }

    // Small delay to avoid rate-limiting
    await new Promise(r => setTimeout(r, 1200))
  }

  const auditResult: DailyAuditResult = {
    runAt,
    durationMs:        Date.now() - t0,
    totalChecked:      products.length,
    healthy,
    unhealthy,
    transient,
    newlySuppressed,
    recovered,
    alreadySuppressed,
    details,
  }

  appendAuditLog(auditResult)
  return auditResult
}

export function getAuditHistory(): DailyAuditResult[] {
  return readAuditLog().runs.slice().reverse()   // newest first
}
