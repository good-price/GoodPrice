/**
 * lib/catalog/integrity.ts
 *
 * GOODPRICE catalog integrity — comprehensive validation and scoring.
 *
 * Validates:
 *   - Duplicate ASINs / product IDs
 *   - Invalid ASIN formats
 *   - Broken / stale image URLs
 *   - Hidden products (failed public gates)
 *   - Quarantined products
 *   - Auto-suppressed products (2+ consecutive audit failures)
 *   - Empty categories (no public products)
 *   - Orphan products (unknown category slug)
 *   - Audit freshness
 *
 * Scoring (0–100):
 *   imageScore      0–25  fraction of products with working images
 *   asinScore       0–25  fraction of products with valid ASIN format
 *   auditScore      0–20  freshness of the last audit report
 *   duplicateScore  0–15  0 if any duplicate/orphan exists; 15 otherwise
 *   hiddenScore     0–15  inverse of hidden-product ratio
 *
 * Used by:
 *   scripts/catalog-integrity.ts      → CLI runner
 *   app/api/catalog/integrity/route.ts → HTTP endpoint
 *   app/admin/page.tsx                 → admin dashboard section
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

import { getAllProducts } from '@/data/catalog'
import { categories } from '@/data/categories'
import { getPublicProducts, getPublicCatalogStats } from '@/lib/catalog/public'
import { isKnownBrokenImageUrl, isInvalidImageUrl } from '@/lib/catalog/placeholders'
import { isValidAsinFormat } from '@/lib/catalog/validator'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface IntegrityIssue {
  severity: 'error' | 'warning' | 'info'
  /** Machine-readable code — stable for programmatic checks */
  code: string
  message: string
  affectedIds?: string[]
  count?: number
}

export interface CategoryIntegrity {
  slug: string
  name: string
  totalProducts: number
  publicProducts: number
  brokenImages: number
  issues: string[]
  /** true if this category has no public products */
  empty: boolean
}

export interface IntegrityScoreBreakdown {
  /** 0-25: fraction of products with non-broken CDN image */
  imageScore: number
  /** 0-25: fraction of products with valid ASIN format */
  asinScore: number
  /** 0-20: freshness of the last audit report */
  auditScore: number
  /** 0-15: 15 if zero duplicates + zero orphans; 0 otherwise */
  duplicateScore: number
  /** 0-15: inverse of hidden-product ratio */
  hiddenScore: number
}

export interface CatalogIntegrityReport {
  generatedAt: string
  /** 0–100 overall integrity score */
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  scoreBreakdown: IntegrityScoreBreakdown

  // ── Counts ─────────────────────────────────────────────────────────────────
  totalProducts: number
  publicProducts: number
  hiddenProducts: number
  quarantinedProducts: number
  /** Products using deprecated images-na CDN (shown as placeholder in UI) */
  staleImages: number
  invalidAsins: number
  duplicatedAsins: string[]
  duplicatedIds: string[]
  orphanProducts: number

  // ── Issues ─────────────────────────────────────────────────────────────────
  issues: IntegrityIssue[]

  // ── Per-category breakdown ──────────────────────────────────────────────────
  byCategory: CategoryIntegrity[]

  // ── Audit freshness ─────────────────────────────────────────────────────────
  lastAuditAt: string | null
  auditAgeDays: number | null
}

/** Lightweight snapshot stored for trend comparison */
export interface IntegritySnapshot {
  generatedAt: string
  score: number
  grade: string
  totalProducts: number
  publicProducts: number
  hiddenProducts: number
  staleImages: number
  issueCount: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

function getLastAuditInfo(): { date: string | null; ageDays: number | null } {
  const reportsDir = join(process.cwd(), 'data', 'audit', 'reports')
  if (!existsSync(reportsDir)) return { date: null, ageDays: null }

  let files: string[] = []
  try {
    files = readdirSync(reportsDir).filter(f => f.endsWith('.json')).sort()
  } catch { return { date: null, ageDays: null } }

  if (files.length === 0) return { date: null, ageDays: null }

  try {
    const stats = statSync(join(reportsDir, files[files.length - 1]))
    const mtime = stats.mtime.toISOString()
    const ageDays = Math.floor((Date.now() - stats.mtime.getTime()) / 86_400_000)
    return { date: mtime, ageDays }
  } catch { return { date: null, ageDays: null } }
}

const SNAPSHOT_PATH = join(process.cwd(), 'data', 'catalog', 'integrity-snapshot.json')

export function getLastIntegritySnapshot(): IntegritySnapshot | null {
  if (!existsSync(SNAPSHOT_PATH)) return null
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as IntegritySnapshot
  } catch { return null }
}

export function saveIntegritySnapshot(report: CatalogIntegrityReport): void {
  const snapshot: IntegritySnapshot = {
    generatedAt: report.generatedAt,
    score: report.score,
    grade: report.grade,
    totalProducts: report.totalProducts,
    publicProducts: report.publicProducts,
    hiddenProducts: report.hiddenProducts,
    staleImages: report.staleImages,
    issueCount: report.issues.length,
  }
  try {
    mkdirSync(join(process.cwd(), 'data', 'catalog'), { recursive: true })
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf8')
  } catch { /* non-critical — snapshot is best-effort */ }
}

// ── Core integrity check ───────────────────────────────────────────────────────

export function runCatalogIntegrity(): CatalogIntegrityReport {
  const all            = getAllProducts()
  const publicProducts = getPublicProducts()
  const stats          = getPublicCatalogStats()
  const total          = all.length
  const issues: IntegrityIssue[] = []

  // ── Duplicate ASINs ────────────────────────────────────────────────────────
  const asinCounts = new Map<string, string[]>()
  const idCounts   = new Map<string, string[]>()

  for (const p of all) {
    if (p.asin) {
      const list = asinCounts.get(p.asin) ?? []
      list.push(p.id ?? 'unknown')
      asinCounts.set(p.asin, list)
    }
    if (p.id) {
      const list = idCounts.get(p.id) ?? []
      list.push(p.asin ?? 'unknown')
      idCounts.set(p.id, list)
    }
  }

  const duplicatedAsins: string[] = Array.from(asinCounts.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([asin]) => asin)

  const duplicatedIds: string[] = Array.from(idCounts.entries())
    .filter(([, asins]) => asins.length > 1)
    .map(([id]) => id)

  if (duplicatedAsins.length > 0) {
    issues.push({
      severity: 'error',
      code: 'DUPLICATE_ASIN',
      message: `${duplicatedAsins.length} ASIN(s) duplicado(s) — puede causar páginas 404 o tracking incorrecto`,
      affectedIds: duplicatedAsins,
      count: duplicatedAsins.length,
    })
  }

  if (duplicatedIds.length > 0) {
    issues.push({
      severity: 'error',
      code: 'DUPLICATE_ID',
      message: `${duplicatedIds.length} product ID(s) duplicado(s) — rompe analytics y watchlist`,
      affectedIds: duplicatedIds,
      count: duplicatedIds.length,
    })
  }

  // ── Invalid ASIN format ────────────────────────────────────────────────────
  const invalidAsinProducts = all.filter(p => !p.asin || !isValidAsinFormat(p.asin))
  if (invalidAsinProducts.length > 0) {
    issues.push({
      severity: 'error',
      code: 'INVALID_ASIN',
      message: `${invalidAsinProducts.length} producto(s) con ASIN inválido o vacío — no pueden enlazar a Amazon`,
      affectedIds: invalidAsinProducts.map(p => p.id ?? 'unknown'),
      count: invalidAsinProducts.length,
    })
  }

  // ── Broken / stale images ──────────────────────────────────────────────────
  const brokenImageProducts = all.filter(p => isKnownBrokenImageUrl(p.image))
  const invalidImageProducts = all.filter(p => isInvalidImageUrl(p.image))

  if (brokenImageProducts.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'STALE_IMAGE_CDN',
      message: `${brokenImageProducts.length} producto(s) con CDN deprecated (images-na) — usando placeholder en UI`,
      affectedIds: brokenImageProducts.map(p => p.id ?? 'unknown'),
      count: brokenImageProducts.length,
    })
  }

  if (invalidImageProducts.length > 0) {
    issues.push({
      severity: 'error',
      code: 'INVALID_IMAGE_URL',
      message: `${invalidImageProducts.length} producto(s) con URL de imagen vacía o inválida`,
      affectedIds: invalidImageProducts.map(p => p.id ?? 'unknown'),
      count: invalidImageProducts.length,
    })
  }

  // ── Hidden products ────────────────────────────────────────────────────────
  if (stats.hidden > 0) {
    const hiddenPct = total > 0 ? Math.round((stats.hidden / total) * 100) : 0
    issues.push({
      severity: hiddenPct > 30 ? 'error' : 'warning',
      code: 'HIDDEN_PRODUCTS',
      message: `${stats.hidden} producto(s) ocultos del catálogo público (${hiddenPct}%)`,
      count: stats.hidden,
    })
  }

  if (stats.quarantined > 0) {
    issues.push({
      severity: 'warning',
      code: 'QUARANTINED_PRODUCTS',
      message: `${stats.quarantined} producto(s) en cuarentena`,
      count: stats.quarantined,
    })
  }

  if (stats.autoSuppressed > 0) {
    issues.push({
      severity: 'error',
      code: 'AUTO_SUPPRESSED',
      message: `${stats.autoSuppressed} producto(s) auto-suprimidos por 2+ auditorías fallidas consecutivas`,
      count: stats.autoSuppressed,
    })
  }

  // ── Orphan products (unknown category) ────────────────────────────────────
  const validSlugs = new Set(categories.map(c => c.slug))
  const orphanProducts = all.filter(p => !validSlugs.has(p.category))
  if (orphanProducts.length > 0) {
    const unknownCats = Array.from(new Set(orphanProducts.map(p => p.category))).join(', ')
    issues.push({
      severity: 'error',
      code: 'ORPHAN_PRODUCT',
      message: `${orphanProducts.length} producto(s) con categoría desconocida: ${unknownCats}`,
      affectedIds: orphanProducts.map(p => p.id ?? 'unknown'),
      count: orphanProducts.length,
    })
  }

  // ── Empty categories (no public products) ─────────────────────────────────
  const publicCountByCategory = new Map<string, number>()
  for (const p of publicProducts) {
    publicCountByCategory.set(p.category, (publicCountByCategory.get(p.category) ?? 0) + 1)
  }

  const emptyCategories = categories.filter(c => (publicCountByCategory.get(c.slug) ?? 0) === 0)
  if (emptyCategories.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'EMPTY_CATEGORY',
      message: `${emptyCategories.length} categoría(s) sin productos públicos: ${emptyCategories.map(c => c.slug).join(', ')}`,
      affectedIds: emptyCategories.map(c => c.slug),
      count: emptyCategories.length,
    })
  }

  // ── Audit freshness ────────────────────────────────────────────────────────
  const { date: lastAuditAt, ageDays: auditAgeDays } = getLastAuditInfo()

  if (lastAuditAt === null) {
    issues.push({
      severity: 'warning',
      code: 'NO_AUDIT',
      message: 'Sin auditoría ejecutada — ejecuta POST /api/audit/run para generar el primer reporte',
    })
  } else if (auditAgeDays !== null && auditAgeDays > 60) {
    issues.push({
      severity: 'warning',
      code: 'STALE_AUDIT',
      message: `La última auditoría fue hace ${auditAgeDays} días (>60) — considera re-ejecutarla`,
    })
  } else if (auditAgeDays !== null && auditAgeDays > 30) {
    issues.push({
      severity: 'info',
      code: 'AGING_AUDIT',
      message: `La última auditoría fue hace ${auditAgeDays} días — próxima en ${60 - auditAgeDays} días`,
    })
  }

  // ── Per-category integrity ─────────────────────────────────────────────────
  const allByCategory = new Map<string, typeof all>()
  for (const p of all) {
    const list = allByCategory.get(p.category) ?? []
    list.push(p)
    allByCategory.set(p.category, list)
  }

  const byCategory: CategoryIntegrity[] = categories.map(cat => {
    const catAll    = allByCategory.get(cat.slug) ?? []
    const catPublic = publicCountByCategory.get(cat.slug) ?? 0
    const catBroken = catAll.filter(p => isKnownBrokenImageUrl(p.image)).length
    const catIssues: string[] = []

    if (catAll.length === 0)    catIssues.push('Sin productos en catálogo')
    else if (catPublic === 0)   catIssues.push('Sin productos públicos')
    if (catBroken > 0)          catIssues.push(`${catBroken} imagen${catBroken > 1 ? 'es' : ''} CDN deprecated`)
    if (catAll.some(p => !p.asin || !isValidAsinFormat(p.asin))) {
      catIssues.push('Tiene ASINs inválidos')
    }

    return {
      slug: cat.slug,
      name: cat.name,
      totalProducts: catAll.length,
      publicProducts: catPublic,
      brokenImages: catBroken,
      issues: catIssues,
      empty: catPublic === 0,
    }
  })

  // ── Score calculation ──────────────────────────────────────────────────────
  // imageScore (0-25): penalizes broken CDN images
  //   0% broken → 25, linearly → 0 at ~33% broken
  const brokenRatio = total > 0 ? brokenImageProducts.length / total : 0
  const imageScore = Math.round(Math.max(0, 25 * (1 - brokenRatio * 3)))

  // asinScore (0-25): fraction of products with valid ASIN format
  const validAsinCount = all.filter(p => p.asin && isValidAsinFormat(p.asin)).length
  const asinScore = total > 0 ? Math.round((validAsinCount / total) * 25) : 25

  // auditScore (0-20): freshness bands
  let auditScore: number
  if (auditAgeDays === null)        auditScore = 0
  else if (auditAgeDays <= 7)       auditScore = 20
  else if (auditAgeDays <= 30)      auditScore = 15
  else if (auditAgeDays <= 60)      auditScore = 5
  else                              auditScore = 0

  // duplicateScore (0-15): full marks only if no duplicates AND no orphans
  const duplicateScore =
    duplicatedAsins.length === 0 && duplicatedIds.length === 0 && orphanProducts.length === 0
      ? 15 : 0

  // hiddenScore (0-15): inverse of hidden ratio
  //   0% hidden → 15, linearly → 0 at ~50% hidden
  const hiddenRatio = total > 0 ? stats.hidden / total : 0
  const hiddenScore = Math.round(Math.max(0, 15 * (1 - hiddenRatio * 2)))

  const score = Math.min(100, imageScore + asinScore + auditScore + duplicateScore + hiddenScore)
  const grade = computeGrade(score)

  return {
    generatedAt: new Date().toISOString(),
    score,
    grade,
    scoreBreakdown: { imageScore, asinScore, auditScore, duplicateScore, hiddenScore },

    totalProducts: total,
    publicProducts: stats['public'],
    hiddenProducts: stats.hidden,
    quarantinedProducts: stats.quarantined,
    staleImages: brokenImageProducts.length,
    invalidAsins: invalidAsinProducts.length,
    duplicatedAsins,
    duplicatedIds,
    orphanProducts: orphanProducts.length,

    issues,
    byCategory,
    lastAuditAt,
    auditAgeDays,
  }
}
