/**
 * GOODPRICE Audit Runner — standalone script
 * Run with: npx tsx scripts/audit-runner.ts
 *
 * Executes a full catalog audit and prints a comprehensive report.
 * Results are also saved to data/audit/reports/latest.json
 */

import { getRawProducts } from '@/data/catalog'
import { isValidAsinFormat } from '@/lib/catalog/validator'
import { auditCompleteness } from '@/lib/audit/validators/completeness'
import { auditColombia } from '@/lib/audit/validators/colombia'
import { auditImage } from '@/lib/audit/validators/image'
import { runAudit, saveReport, formatAuditSummary } from '@/lib/audit/report'
import type { ProductReliabilityScore } from '@/lib/audit/types'

// ── Config ────────────────────────────────────────────────────────────────────

const OFFLINE_MODE    = process.argv.includes('--offline')
const CONCURRENCY     = 5
const ASIN_DELAY_MS   = 400
const IMAGE_DELAY_MS  = 200

// ── Formatting ────────────────────────────────────────────────────────────────

const RESET  = '\x1b[0m'
const BOLD   = '\x1b[1m'
const RED    = '\x1b[31m'
const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BLUE   = '\x1b[34m'
const CYAN   = '\x1b[36m'
const GRAY   = '\x1b[90m'
const ORANGE = '\x1b[38;5;208m'

function color(text: string | number, c: string) { return `${c}${text}${RESET}` }
function bold(text: string | number)  { return `${BOLD}${text}${RESET}` }
function red(t: string | number)      { return color(t, RED) }
function green(t: string | number)    { return color(t, GREEN) }
function yellow(t: string | number)   { return color(t, YELLOW) }
function blue(t: string | number)     { return color(t, BLUE) }
function cyan(t: string | number)     { return color(t, CYAN) }
function gray(t: string | number)     { return color(t, GRAY) }
function orange(t: string | number)   { return color(t, ORANGE) }

function gradeColor(grade: string) {
  const map: Record<string, (t: string | number) => string> = {
    A: green, B: blue, C: yellow, D: orange, F: red,
  }
  return (map[grade] ?? gray)(grade)
}

function scoreColor(score: number) {
  if (score >= 90) return green(score)
  if (score >= 70) return blue(score)
  if (score >= 50) return yellow(score)
  if (score >= 30) return orange(score)
  return red(score)
}

function bar(filled: number, total: number, width = 30): string {
  const filledCount = Math.round((filled / total) * width)
  return '█'.repeat(filledCount) + '░'.repeat(width - filledCount)
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((n / total) * 100)}%`
}

function hr(char = '─', len = 70) { return gray(char.repeat(len)) }

// ── Pre-flight: instant checks ────────────────────────────────────────────────

function preFlightCheck() {
  const products = getRawProducts()
  console.log()
  console.log(bold('━'.repeat(70)))
  console.log(bold(`  GOODPRICE Catalog Audit — ${new Date().toLocaleString('es-CO')}`))
  console.log(bold('━'.repeat(70)))
  console.log()
  console.log(`  Modo: ${OFFLINE_MODE ? yellow('OFFLINE (sin verificación de red)') : green('ONLINE (verificación completa)')}`)
  console.log(`  Productos en catálogo: ${bold(products.length)}`)
  console.log(`  Concurrencia: ${CONCURRENCY} · ASIN delay: ${ASIN_DELAY_MS}ms · Img delay: ${IMAGE_DELAY_MS}ms`)
  console.log()

  // Quick offline pre-flight
  const byCategory: Record<string, number> = {}
  let invalidAsinFormat = 0
  let missingBrand = 0
  let unverifiedStatus = 0

  for (const p of products) {
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1
    if (!isValidAsinFormat(p.asin)) invalidAsinFormat++
    if (!p.brand) missingBrand++
    if (p.status !== 'active') unverifiedStatus++
  }

  console.log(bold('  📊 PRE-FLIGHT (sin red)'))
  console.log(hr())
  console.log()
  console.log('  Por categoría:')
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    const b = bar(count, products.length, 20)
    console.log(`    ${cyan(cat.padEnd(16))} ${gray(b)} ${bold(count)} productos`)
  }
  console.log()
  console.log(`  ASINs con formato inválido : ${invalidAsinFormat > 0 ? red(invalidAsinFormat) : green(0)}`)
  console.log(`  Sin brand definido         : ${missingBrand > 0 ? yellow(missingBrand) : green(0)}`)
  console.log(`  Status ≠ active            : ${unverifiedStatus > 0 ? yellow(unverifiedStatus) : green(0)}`)
  console.log()

  return products.length
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const total = preFlightCheck()

  if (!OFFLINE_MODE) {
    const eta = Math.round(
      // ASIN: batches × delay + ~2s request time per batch
      (Math.ceil(total / CONCURRENCY) * (ASIN_DELAY_MS + 2000) +
      // Image: batches × delay + ~0.5s per batch
      Math.ceil(total / CONCURRENCY) * (IMAGE_DELAY_MS + 500)) / 1000
    )
    console.log(bold('  ⏳ INICIANDO AUDITORÍA COMPLETA'))
    console.log(hr())
    console.log()
    console.log(`  Verificando ASINs en Amazon y accesibilidad de imágenes...`)
    console.log(`  Tiempo estimado: ${bold(eta + ' segundos')} (~${Math.ceil(eta / 60)} min)`)
    console.log(`  ${gray('(Ctrl+C para cancelar y ver resultados parciales)')}`)
    console.log()
  } else {
    console.log(bold('  ⚡ INICIANDO AUDITORÍA OFFLINE (solo datos en memoria)'))
    console.log(hr())
    console.log()
  }

  const startMs = Date.now()

  const report = await runAudit({
    offlineMode:  OFFLINE_MODE,
    concurrency:  CONCURRENCY,
    asinDelayMs:  ASIN_DELAY_MS,
    imageDelayMs: IMAGE_DELAY_MS,
  })

  // Save to disk
  const filepath = saveReport(report)

  const durationSec = ((Date.now() - startMs) / 1000).toFixed(1)

  // ── Print report ────────────────────────────────────────────────────────────

  console.log()
  console.log(bold('━'.repeat(70)))
  console.log(bold('  📋 RESULTADOS DE AUDITORÍA'))
  console.log(bold('━'.repeat(70)))
  console.log()

  // Overall score
  const avgColor = report.averageScore >= 70 ? green : report.averageScore >= 50 ? yellow : red
  console.log(`  Score promedio: ${bold(avgColor(report.averageScore + '/100'))}`)
  console.log(`  Duración      : ${bold(durationSec + 's')}`)
  console.log(`  Reporte en    : ${gray(filepath)}`)
  console.log()

  // Grade distribution
  console.log(bold('  📊 DISTRIBUCIÓN DE GRADES'))
  console.log(hr())
  const grades = ['A', 'B', 'C', 'D', 'F'] as const
  for (const g of grades) {
    const count = report.gradeDistribution[g]
    const b = bar(count, total, 25)
    const pctStr = pct(count, total).padStart(4)
    console.log(`    ${gradeColor(g)}  ${gray(b)} ${bold(count).padEnd(5)} ${gray(pctStr)}`)
  }
  console.log()
  const healthy = report.gradeDistribution.A + report.gradeDistribution.B
  const pctHealthy = Math.round((healthy / total) * 100)
  console.log(`  ✅ Catálogo sano (A+B): ${bold(healthy)} productos ${green(pctHealthy + '%')}`)
  console.log()

  // Issue counts
  console.log(bold('  🔎 ISSUES DETECTADOS'))
  console.log(hr())
  const issueRows: [string, number, boolean][] = [
    ['ASIN formato inválido',   report.issues.invalidAsinFormat,   false],
    ['Productos Amazon 404',    report.issues.unreachableProducts, false],
    ['Imágenes inaccesibles',   report.issues.brokenImages,        false],
    ['Datos incompletos',       report.issues.incompleteProducts,  false],
    ['Bloqueados Colombia',     report.issues.colombiaRestricted,  true ], // may be expected
    ['En cuarentena',           report.issues.quarantined,         false],
  ]
  for (const [label, count, isInfo] of issueRows) {
    const countStr = count === 0
      ? green('  0')
      : isInfo ? yellow(String(count).padStart(3)) : red(String(count).padStart(3))
    const pctStr = pct(count, total).padStart(5)
    console.log(`    ${label.padEnd(28)} ${countStr}  ${gray(pctStr)}`)
  }
  console.log()

  // By-category breakdown
  console.log(bold('  📂 SALUD POR CATEGORÍA'))
  console.log(hr())
  console.log(`    ${'Categoría'.padEnd(16)} ${'Prods'.padEnd(7)} ${'Avg Score'.padEnd(12)} ${'A+B'.padEnd(7)} ${'D+F'.padEnd(7)} Issues`)

  const categoryMap: Record<string, {
    products: ProductReliabilityScore[]
    totalScore: number
    aPlus: number
    dF: number
    issues: number
  }> = {}

  for (const p of report.products) {
    if (!categoryMap[p.category]) {
      categoryMap[p.category] = { products: [], totalScore: 0, aPlus: 0, dF: 0, issues: 0 }
    }
    const cat = categoryMap[p.category]
    cat.products.push(p)
    cat.totalScore += p.score
    if (p.grade === 'A' || p.grade === 'B') cat.aPlus++
    if (p.grade === 'D' || p.grade === 'F') cat.dF++
    if (!p.asinCheck.formatValid || p.asinCheck.reachable === false || !p.imageCheck.accessible) cat.issues++
  }

  const catRows = Object.entries(categoryMap)
    .map(([cat, d]) => ({
      cat,
      count: d.products.length,
      avgScore: Math.round(d.totalScore / d.products.length),
      aPlus: d.aPlus,
      dF: d.dF,
      issues: d.issues,
    }))
    .sort((a, b) => a.avgScore - b.avgScore) // worst first

  for (const row of catRows) {
    const scoreStr = scoreColor(row.avgScore)
    const dFStr   = row.dF > 0 ? red(String(row.dF)) : gray('0')
    const issueStr = row.issues > 0 ? yellow(String(row.issues)) : gray('0')
    console.log(
      `    ${row.cat.padEnd(16)} ${String(row.count).padEnd(7)} ${scoreStr.padEnd(20)} ${String(row.aPlus).padEnd(7)} ${dFStr.padEnd(16)} ${issueStr}`
    )
  }
  console.log()

  // Critical products
  if (report.criticalProducts.length > 0) {
    console.log(bold(`  🚨 PRODUCTOS CRÍTICOS (Grade D/F) — ${report.criticalProducts.length} productos`))
    console.log(hr())
    console.log()

    for (const p of report.criticalProducts.slice(0, 30)) {
      console.log(`    ${gradeColor(p.grade)} ${red(p.score.toString().padStart(3))}  ${bold(p.asin)} ${gray(p.category)}`)
      console.log(`       ${p.title.slice(0, 60)}${p.title.length > 60 ? '…' : ''}`)
      for (const issue of p.issues.slice(0, 2)) {
        console.log(`       ${red('▸')} ${gray(issue)}`)
      }
      console.log()
    }

    if (report.criticalProducts.length > 30) {
      console.log(`    ${gray(`... y ${report.criticalProducts.length - 30} más (ver latest.json para lista completa)`)}`)
      console.log()
    }
  } else {
    console.log(bold('  ✅ Sin productos críticos (grade D/F)'))
    console.log()
  }

  // Top issues (any grade) with reachable === false
  const amazonDeadProducts = report.products.filter(p => p.asinCheck.reachable === false)
  if (amazonDeadProducts.length > 0) {
    console.log(bold(`  💀 PRODUCTOS MUERTOS EN AMAZON (404) — ${amazonDeadProducts.length}`))
    console.log(hr())
    for (const p of amazonDeadProducts) {
      console.log(`    ${red('✗')} ${bold(p.asin)} ${gray(p.category)} — ${p.title.slice(0, 50)}`)
    }
    console.log()
  }

  const brokenImages = report.products.filter(p => !p.imageCheck.accessible)
  if (!OFFLINE_MODE && brokenImages.length > 0) {
    console.log(bold(`  🖼 IMÁGENES INACCESIBLES — ${brokenImages.length}`))
    console.log(hr())
    for (const p of brokenImages.slice(0, 20)) {
      const status = p.imageCheck.httpStatus ? `HTTP ${p.imageCheck.httpStatus}` : 'error de red'
      console.log(`    ${yellow('!')} ${bold(p.asin)} ${gray(p.category)} — ${status}`)
      console.log(`      ${gray(p.imageCheck.imageUrl.slice(0, 70))}`)
    }
    console.log()
  }

  // Format summary
  console.log(bold('━'.repeat(70)))
  console.log()
  console.log(formatAuditSummary(report))
  console.log()
  console.log(`  Reporte completo guardado en:`)
  console.log(`  ${cyan(filepath)}`)
  console.log()

  return report
}

main().catch(err => {
  console.error('\n❌ Error en auditoría:', err)
  process.exit(1)
})
