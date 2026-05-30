#!/usr/bin/env tsx
/**
 * scripts/catalog-integrity.ts
 *
 * CLI tool — runs a full catalog integrity check and prints a formatted report.
 *
 * Usage:
 *   npx tsx scripts/catalog-integrity.ts            → formatted report
 *   npx tsx scripts/catalog-integrity.ts --json     → raw JSON output
 *   npx tsx scripts/catalog-integrity.ts --save     → saves snapshot to data/catalog/integrity-snapshot.json
 *   npx tsx scripts/catalog-integrity.ts --strict   → exit 1 if any errors or score < 70
 *
 * Exit codes:
 *   0  all checks passed (or only warnings)
 *   1  critical errors found (invalid ASINs, duplicates, orphans) — or --strict and score < 70
 */

// Load .env.local before any catalog imports that read process.env
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const envPath = join(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
}

import {
  runCatalogIntegrity,
  saveIntegritySnapshot,
  getLastIntegritySnapshot,
} from '@/lib/catalog/integrity'
import type { CatalogIntegrityReport, IntegrityIssue } from '@/lib/catalog/integrity'

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
}

const OK   = `${C.green}✓${C.reset}`
const WARN = `${C.yellow}⚠${C.reset}`
const ERR  = `${C.red}✗${C.reset}`
const INFO = `${C.dim}i${C.reset}`

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return C.green
    case 'B': return C.cyan
    case 'C': return C.yellow
    case 'D': return '\x1b[33m'  // orange-ish
    default:  return C.red
  }
}

function scoreBar(score: number, max = 100, width = 20): string {
  const filled = Math.round((score / max) * width)
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
  return bar
}

function severityIcon(s: IntegrityIssue['severity']): string {
  return s === 'error' ? ERR : s === 'warning' ? WARN : INFO
}

function printReport(report: CatalogIntegrityReport, prevSnapshot: ReturnType<typeof getLastIntegritySnapshot>): void {
  const trendDelta = prevSnapshot ? report.score - prevSnapshot.score : null
  const trendStr =
    trendDelta === null ? '' :
    trendDelta > 0      ? ` ${C.green}↑+${trendDelta}${C.reset}` :
    trendDelta < 0      ? ` ${C.red}↓${trendDelta}${C.reset}` :
    ` ${C.dim}→${C.reset}`

  const gc = gradeColor(report.grade)

  console.log()
  console.log(`${C.bold}${C.cyan}GOODPRICE — Integridad del catálogo${C.reset}`)
  console.log(`${C.dim}${new Date(report.generatedAt).toLocaleString('es-CO')}${C.reset}`)
  console.log()

  // ── Score banner ────────────────────────────────────────────────────────────
  console.log(`  ${C.bold}Score: ${gc}${report.score}/100${C.reset}${trendStr}  Grade: ${gc}${C.bold}${report.grade}${C.reset}`)
  console.log(`  ${C.dim}${scoreBar(report.score)}${C.reset}`)
  console.log()

  // ── Score breakdown ─────────────────────────────────────────────────────────
  const bd = report.scoreBreakdown
  const row = (label: string, pts: number, max: number) => {
    const pct = pts === max ? OK : pts > 0 ? WARN : ERR
    return `  ${pct}  ${label.padEnd(22)} ${C.bold}${pts}${C.reset}/${max}`
  }
  console.log(`${C.bold}Desglose del score${C.reset}`)
  console.log(row('Imágenes',     bd.imageScore,     25))
  console.log(row('ASINs válidos', bd.asinScore,      25))
  console.log(row('Auditoría',    bd.auditScore,     20))
  console.log(row('Duplicados',   bd.duplicateScore, 15))
  console.log(row('Ocultamiento', bd.hiddenScore,    15))
  console.log()

  // ── Counts ──────────────────────────────────────────────────────────────────
  console.log(`${C.bold}Catálogo${C.reset}`)
  console.log(`  ${OK}  Total productos       ${C.bold}${report.totalProducts}${C.reset}`)
  console.log(`  ${report.publicProducts > 0 ? OK : ERR}  Productos públicos    ${C.bold}${report.publicProducts}${C.reset}`)
  console.log(`  ${report.hiddenProducts > 0 ? WARN : OK}  Productos ocultos     ${C.bold}${report.hiddenProducts}${C.reset}`)
  console.log(`  ${report.staleImages > 0 ? WARN : OK}  Imágenes CDN stale    ${C.bold}${report.staleImages}${C.reset}`)
  console.log(`  ${report.invalidAsins > 0 ? ERR : OK}  ASINs inválidos       ${C.bold}${report.invalidAsins}${C.reset}`)
  console.log(`  ${report.duplicatedAsins.length > 0 ? ERR : OK}  ASINs duplicados      ${C.bold}${report.duplicatedAsins.length}${C.reset}`)
  console.log(`  ${report.duplicatedIds.length > 0 ? ERR : OK}  IDs duplicados        ${C.bold}${report.duplicatedIds.length}${C.reset}`)
  console.log(`  ${report.orphanProducts > 0 ? ERR : OK}  Productos huérfanos   ${C.bold}${report.orphanProducts}${C.reset}`)
  console.log(`  ${report.quarantinedProducts > 0 ? WARN : OK}  En cuarentena         ${C.bold}${report.quarantinedProducts}${C.reset}`)
  if (report.lastAuditAt) {
    const freshStr = report.auditAgeDays !== null ? `hace ${report.auditAgeDays}d` : '?'
    const fresh = (report.auditAgeDays ?? 999) <= 30 ? OK : WARN
    console.log(`  ${fresh}  Última auditoría      ${C.bold}${freshStr}${C.reset}`)
  } else {
    console.log(`  ${WARN}  Última auditoría      ${C.bold}nunca${C.reset}`)
  }
  console.log()

  // ── Issues ──────────────────────────────────────────────────────────────────
  if (report.issues.length === 0) {
    console.log(`${OK} ${C.green}Sin issues activas — catálogo en buen estado${C.reset}`)
  } else {
    const errors   = report.issues.filter(i => i.severity === 'error')
    const warnings = report.issues.filter(i => i.severity === 'warning')
    const infos    = report.issues.filter(i => i.severity === 'info')

    console.log(`${C.bold}Issues activas${C.reset}  ${C.red}${errors.length} errores${C.reset}  ${C.yellow}${warnings.length} advertencias${C.reset}  ${C.dim}${infos.length} info${C.reset}`)
    for (const issue of report.issues) {
      console.log(`  ${severityIcon(issue.severity)}  [${C.dim}${issue.code}${C.reset}] ${issue.message}`)
    }
  }
  console.log()

  // ── Top problematic categories ───────────────────────────────────────────────
  const problematic = report.byCategory
    .filter(c => c.issues.length > 0)
    .sort((a, b) => b.issues.length - a.issues.length || b.brokenImages - a.brokenImages)
    .slice(0, 5)

  if (problematic.length > 0) {
    console.log(`${C.bold}Categorías con issues${C.reset}`)
    for (const cat of problematic) {
      const pub = cat.publicProducts > 0 ? OK : ERR
      console.log(
        `  ${pub}  ${cat.name.padEnd(16)}  ${cat.publicProducts}/${cat.totalProducts} públicos` +
        (cat.brokenImages > 0 ? `  ${C.yellow}${cat.brokenImages} imágenes stale${C.reset}` : '') +
        (cat.issues.length > 0 ? `  ${C.dim}${cat.issues.join(', ')}${C.reset}` : '')
      )
    }
    console.log()
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const outputJson = args.includes('--json')
  const saveSnap   = args.includes('--save')
  const strict     = args.includes('--strict')

  const report = runCatalogIntegrity()
  const prev   = getLastIntegritySnapshot()

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printReport(report, prev)
  }

  if (saveSnap) {
    saveIntegritySnapshot(report)
    if (!outputJson) {
      console.log(`${OK} Snapshot guardado → data/catalog/integrity-snapshot.json`)
    }
  }

  const hasErrors = report.issues.some(i => i.severity === 'error')
  const lowScore  = report.score < 70

  if (hasErrors) {
    if (!outputJson) {
      process.stdout.write(
        `\x1b[31m\x1b[1m✗ INTEGRITY FAIL — corrige los errores en rojo\x1b[0m\n\n`
      )
    }
    process.exit(1)
  }

  if (strict && lowScore) {
    if (!outputJson) {
      process.stdout.write(
        `\x1b[33m\x1b[1m⚠ STRICT MODE — score ${report.score}/100 está por debajo de 70\x1b[0m\n\n`
      )
    }
    process.exit(1)
  }

  if (!outputJson) {
    process.stdout.write(`\x1b[32m\x1b[1m✓ INTEGRITY OK${report.issues.length > 0 ? ' (con advertencias)' : ''}\x1b[0m\n\n`)
  }
}

main().catch(err => {
  console.error('\x1b[31mError ejecutando catalog-integrity:\x1b[0m', err)
  process.exit(1)
})
