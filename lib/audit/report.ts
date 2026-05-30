/**
 * GOODPRICE Audit — Report Generator
 *
 * Runs a full audit pass across the entire catalog and produces a
 * CatalogAuditReport. This is the main entry point for the audit system.
 *
 * Processing:
 *   1. Load all raw products from catalog
 *   2. For each product: run ASIN check, image check, completeness check, Colombia check
 *   3. Compute reliability score
 *   4. Assemble report with issue counts, grade distribution, critical products list
 *
 * Network calls:
 *   - ASIN checks: HEAD amazon.com/dp/<ASIN> (batched, rate-limited)
 *   - Image checks: HEAD image-url (batched, rate-limited)
 *
 * Duration: ~5–15 minutes for 200 products (network bound)
 * Sequential by default to avoid hammering Amazon or CDN servers.
 *
 * Quarantine integration:
 *   - Checks existing quarantine list to mark quarantined products
 *   - Does NOT auto-quarantine — that is the caller's decision
 */

import { getRawProducts } from '@/data/catalog'
import { getQuarantine }   from './quarantine'
import { auditAsin }        from './validators/asin'
import { auditImage }       from './validators/image'
import { auditCompleteness } from './validators/completeness'
import { auditColombia }    from './validators/colombia'
import {
  computeScore,
  extractTopIssues,
  overallSeverity,
} from './scoring'
import type {
  CatalogAuditReport,
  AuditRecord,
  ProductReliabilityScore,
} from './types'

// ── Run options ───────────────────────────────────────────────────────────────

export interface RunAuditOptions {
  /** Only audit these product IDs (subset mode) */
  productIds?: string[]
  /** Delay between ASIN batches in ms (default: 600) */
  asinDelayMs?: number
  /** Delay between image batches in ms (default: 300) */
  imageDelayMs?: number
  /** Concurrency per batch (default: 3) */
  concurrency?: number
  /** Skip network checks — only run completeness + Colombia (fast, offline mode) */
  offlineMode?: boolean
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function generateRunId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function processBatch<T, R>(
  items:       T[],
  fn:          (item: T) => Promise<R>,
  concurrency: number,
  delayMs:     number
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
    if (i + concurrency < items.length) await delay(delayMs)
  }
  return results
}

// ── Main report runner ────────────────────────────────────────────────────────

export async function runAudit(options: RunAuditOptions = {}): Promise<CatalogAuditReport> {
  const {
    productIds,
    asinDelayMs  = 600,
    imageDelayMs = 300,
    concurrency  = 3,
    offlineMode  = false,
  } = options

  const runId     = generateRunId()
  const startedAt = new Date().toISOString()
  const start     = Date.now()

  // ── 1. Load products ──────────────────────────────────────────────────────

  let products = getRawProducts()
  if (productIds && productIds.length > 0) {
    const ids = new Set(productIds)
    products = products.filter(p => ids.has(p.id))
  }

  // ── 2. Load quarantine state ──────────────────────────────────────────────

  const quarantine    = getQuarantine()
  const quarantineIds = new Set(Object.keys(quarantine.entries))

  // ── 3. Run completeness + Colombia checks (no network, fast) ─────────────

  const completenessMap = new Map(
    products.map(p => [p.id, auditCompleteness(p)])
  )
  const colombiaMap = new Map(
    products.map(p => [p.id, auditColombia(p)])
  )

  // ── 4. Run ASIN checks (network, batched) ─────────────────────────────────

  let asinCheckMap: Map<string, Awaited<ReturnType<typeof auditAsin>>>

  if (offlineMode) {
    // Offline: mark all as unknown
    asinCheckMap = new Map(
      products.map(p => [p.id, {
        productId: p.id, asin: p.asin,
        formatValid: /^[A-Z0-9]{10}$/.test(p.asin),
        reachable: null as null,
        checkedAt: new Date().toISOString(),
        severity: 'info' as const,
        notes: ['[Modo offline] Verificación HTTP omitida'],
      }])
    )
  } else {
    const asinResults = await processBatch(
      products,
      p => auditAsin(p.id, p.asin),
      concurrency,
      asinDelayMs
    )
    asinCheckMap = new Map(asinResults.map(r => [r.productId, r]))
  }

  // ── 5. Run image checks (network, batched) ────────────────────────────────

  let imageCheckMap: Map<string, Awaited<ReturnType<typeof auditImage>>>

  if (offlineMode) {
    imageCheckMap = new Map(
      products.map(p => [p.id, {
        productId: p.id, imageUrl: p.image,
        accessible: true,
        checkedAt: new Date().toISOString(),
        severity: 'info' as const,
        notes: ['[Modo offline] Verificación HTTP omitida'],
      }])
    )
  } else {
    const imageResults = await processBatch(
      products,
      p => auditImage(p.id, p.image),
      concurrency,
      imageDelayMs
    )
    imageCheckMap = new Map(imageResults.map(r => [r.productId, r]))
  }

  // ── 6. Compute reliability scores ─────────────────────────────────────────

  const scored: ProductReliabilityScore[] = products.map(p => {
    const asinCheck        = asinCheckMap.get(p.id)!
    const imageCheck       = imageCheckMap.get(p.id)!
    const completenessCheck = completenessMap.get(p.id)!
    const colombiaCheck    = colombiaMap.get(p.id)!
    const quarantined      = quarantineIds.has(p.id)

    return computeScore(p, asinCheck, imageCheck, completenessCheck, colombiaCheck, quarantined)
  })

  // ── 7. Assemble report ────────────────────────────────────────────────────

  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  let   totalScore = 0
  const issues = {
    invalidAsinFormat:   0,
    unreachableProducts: 0,
    brokenImages:        0,
    incompleteProducts:  0,
    colombiaRestricted:  0,
    quarantined:         0,
  }

  const criticalProducts: AuditRecord[] = []

  for (const s of scored) {
    gradeDistribution[s.grade]++
    totalScore += s.score

    if (!s.asinCheck.formatValid)             issues.invalidAsinFormat++
    if (s.asinCheck.reachable === false)      issues.unreachableProducts++
    if (!s.imageCheck.accessible)             issues.brokenImages++
    if (s.completenessCheck.missingFields.length > 0) issues.incompleteProducts++
    if (!s.colombiaCheck.shippable)           issues.colombiaRestricted++
    if (s.quarantined)                        issues.quarantined++

    if (s.grade === 'D' || s.grade === 'F') {
      criticalProducts.push({
        productId:   s.productId,
        asin:        s.asin,
        title:       s.title,
        category:    s.category,
        brand:       s.brand,
        score:       s.score,
        grade:       s.grade,
        issues:      extractTopIssues(s),
        severity:    overallSeverity(s),
        quarantined: s.quarantined,
        auditedAt:   s.auditedAt,
      })
    }
  }

  // Sort products by score ascending (worst first)
  const sortedProducts = [...scored].sort((a, b) => a.score - b.score)
  criticalProducts.sort((a, b) => a.score - b.score)

  const averageScore = products.length > 0
    ? Math.round(totalScore / products.length)
    : 0

  const completedAt = new Date().toISOString()

  return {
    runId,
    startedAt,
    completedAt,
    durationMs:    Date.now() - start,
    totalProducts: products.length,
    gradeDistribution,
    averageScore,
    issues,
    criticalProducts,
    products: sortedProducts,
  }
}

// ── Report persistence ────────────────────────────────────────────────────────

import fs   from 'fs'
import path from 'path'

const REPORTS_DIR = path.join(process.cwd(), 'data', 'audit', 'reports')

/** Persist a report to disk as JSON */
export function saveReport(report: CatalogAuditReport): string {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true })
  }
  const filename = `${report.runId}.json`
  const filepath = path.join(REPORTS_DIR, filename)
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8')

  // Also write a "latest.json" pointer
  const latestPath = path.join(REPORTS_DIR, 'latest.json')
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2), 'utf-8')

  return filepath
}

/** Load the latest audit report, or null if none exists */
export function loadLatestReport(): CatalogAuditReport | null {
  const latestPath = path.join(REPORTS_DIR, 'latest.json')
  try {
    const raw = fs.readFileSync(latestPath, 'utf-8')
    return JSON.parse(raw) as CatalogAuditReport
  } catch {
    return null
  }
}

/** List all available audit report run IDs (filenames minus extension) */
export function listReports(): string[] {
  try {
    return fs
      .readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.json') && f !== 'latest.json')
      .map(f => f.replace('.json', ''))
      .sort()
      .reverse() // newest first
  } catch {
    return []
  }
}

/** Load a specific report by runId */
export function loadReport(runId: string): CatalogAuditReport | null {
  const filepath = path.join(REPORTS_DIR, `${runId}.json`)
  try {
    const raw = fs.readFileSync(filepath, 'utf-8')
    return JSON.parse(raw) as CatalogAuditReport
  } catch {
    return null
  }
}

// ── Summary formatter ─────────────────────────────────────────────────────────

export function formatAuditSummary(report: CatalogAuditReport): string {
  const { totalProducts, averageScore, gradeDistribution, issues, durationMs } = report
  const sec = (durationMs / 1_000).toFixed(1)
  const grades = `A:${gradeDistribution.A} B:${gradeDistribution.B} C:${gradeDistribution.C} D:${gradeDistribution.D} F:${gradeDistribution.F}`
  return [
    `[audit] ${totalProducts} productos · score avg ${averageScore}/100 · ${grades}`,
    `  ⚠ ASIN inválido: ${issues.invalidAsinFormat}`,
    `  ⚠ Amazon 404: ${issues.unreachableProducts}`,
    `  ⚠ Imagen rota: ${issues.brokenImages}`,
    `  ⚠ Incompletos: ${issues.incompleteProducts}`,
    `  ⚠ Colombia bloqueado: ${issues.colombiaRestricted}`,
    `  🔒 En cuarentena: ${issues.quarantined}`,
    `  ⏱ ${sec}s`,
  ].join('\n')
}
