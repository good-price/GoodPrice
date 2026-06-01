/**
 * scripts/build-catalog.ts
 *
 * Phase 4 — Trusted Catalog Builder.
 *
 * Builds the Trusted Catalog from the classified candidate pool:
 *   Priority 1: approved (ACTIVE) — all 9 gates passed, real image
 *   Priority 2: approved_degraded (IMAGE_DEGRADED) — business gates only, placeholder image
 *
 * After building, generates a full report:
 *   - Slots occupied / empty
 *   - ACTIVE vs IMAGE_DEGRADED count
 *   - Distribution by category
 *   - KPI: Catalog Fill Rate, Working Coverage, Full Trust Coverage
 *
 * Usage (from goodprice/ directory):
 *   npx tsx scripts/build-catalog.ts
 *   npx tsx scripts/build-catalog.ts --dry-run
 *
 * This script does NOT modify:
 *   - The public-facing catalog (data/catalog/*.ts)
 *   - Any frontend files
 *   - Any feature flags
 */

import { rebuildCatalog, getCatalogKPI, MAX_SLOTS } from '@/lib/tpe/catalog'
import { getCandidatePool }                          from '@/lib/tpe/pool'

// ── CLI ───────────────────────────────────────────────────────────────────────

const dryRun = process.argv.includes('--dry-run')

const DIVIDER = '─'.repeat(72)

function bar(value: number, total: number, width = 36): string {
  if (total === 0) return '░'.repeat(width)
  const filled = Math.round((value / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function pct(value: number, total: number): string {
  if (total === 0) return '  0.0%'
  return `${((value / total) * 100).toFixed(1).padStart(5)}%`
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── Pre-flight ─────────────────────────────────────────────────────────────
  const pool = getCandidatePool()
  const activeCount    = pool.candidates.filter(c => c.status === 'approved').length
  const degradedCount  = pool.candidates.filter(c => c.status === 'approved_degraded').length
  const totalEligible  = activeCount + degradedCount
  const prevInCatalog  = pool.candidates.filter(c => c.status === 'in_catalog').length

  console.log('\n' + DIVIDER)
  console.log('  GOODPRICE — Trusted Product Engine v1')
  console.log('  Phase 4: Trusted Catalog Builder')
  console.log(DIVIDER)
  console.log(`  Dry run:  ${dryRun}`)
  console.log()
  console.log('  PRE-FLIGHT POOL STATE')
  console.log(`  approved (ACTIVE):      ${activeCount}`)
  console.log(`  approved_degraded:      ${degradedCount}`)
  console.log(`  Total eligible:         ${totalEligible}`)
  console.log(`  Previously in_catalog:  ${prevInCatalog}`)
  console.log(`  MAX_SLOTS:              ${MAX_SLOTS}`)
  console.log(`  Will fill:              ${Math.min(totalEligible, MAX_SLOTS)} slots`)
  console.log(`  Will leave empty:       ${MAX_SLOTS - Math.min(totalEligible, MAX_SLOTS)}`)
  if (dryRun) console.log('\n  [DRY RUN] Catalog and pool will NOT be written.')
  console.log()

  // ── Build ──────────────────────────────────────────────────────────────────

  const report = rebuildCatalog({ dryRun })

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log(DIVIDER)
  console.log(`  Run at:   ${report.runAt}`)
  console.log(`  Duration: ${report.durationMs}ms`)
  console.log(DIVIDER)

  console.log('\n  BUILD RESULTS')
  console.log(`  Slots assigned:   ${report.slotsAssigned} / ${MAX_SLOTS}`)
  console.log(`    ACTIVE:         ${report.activeAssigned}`)
  console.log(`    IMAGE_DEGRADED: ${report.degradedAssigned}`)
  console.log(`  Slots empty:      ${report.slotsEmpty}`)

  // ── KPIs ─────────────────────────────────────────────────────────────���─────

  // Get KPIs from the actual catalog (unless dry run)
  const kpi = dryRun
    ? {
        totalSlots:           MAX_SLOTS,
        filledSlots:          report.slotsAssigned,
        emptySlots:           report.slotsEmpty,
        fillRatePercent:      (report.slotsAssigned / MAX_SLOTS) * 100,
        activeCount:          report.activeAssigned,
        imageDegradedCount:   report.degradedAssigned,
        activePercent:        report.slotsAssigned > 0 ? (report.activeAssigned / report.slotsAssigned) * 100 : 0,
        imageDegradedPercent: report.slotsAssigned > 0 ? (report.degradedAssigned / report.slotsAssigned) * 100 : 0,
        byCategory:           report.byCategory,
        computedAt:           report.runAt,
      }
    : getCatalogKPI()

  const workingCoverage   = (kpi.filledSlots / MAX_SLOTS * 100).toFixed(1)
  const fullTrustCoverage = (kpi.activeCount / MAX_SLOTS * 100).toFixed(1)

  console.log('\n' + DIVIDER)
  console.log('  COVERAGE KPIs')
  console.log(DIVIDER)
  console.log()
  console.log(`  Catalog Fill Rate (all admitted / 200 slots)`)
  console.log(`  ${bar(kpi.filledSlots, MAX_SLOTS)}  ${pct(kpi.filledSlots, MAX_SLOTS)}  (${kpi.filledSlots} / ${MAX_SLOTS})`)
  console.log()
  console.log(`  Working Coverage (ACTIVE + IMAGE_DEGRADED)`)
  console.log(`  ${bar(kpi.filledSlots, MAX_SLOTS)}  ${workingCoverage}%`)
  console.log()
  console.log(`  Full Trust Coverage (ACTIVE only — real image)`)
  console.log(`  ${bar(kpi.activeCount, MAX_SLOTS)}  ${fullTrustCoverage}%`)
  console.log()
  console.log(`  ACTIVE count:        ${kpi.activeCount}  (${pct(kpi.activeCount, kpi.filledSlots)} of filled slots)`)
  console.log(`  IMAGE_DEGRADED count:${kpi.imageDegradedCount}  (${pct(kpi.imageDegradedCount, kpi.filledSlots)} of filled slots)`)
  console.log(`  Empty slots:         ${kpi.emptySlots}`)
  console.log()
  const fillPct = kpi.fillRatePercent
  console.log(`  Fill Rate health:    ${fillPct >= 80 ? '🟢 VERDE' : fillPct >= 50 ? '🟡 AMARILLO' : '🔴 ROJO'}`)
  const ftPct = parseFloat(fullTrustCoverage)
  console.log(`  Full Trust health:   ${ftPct >= 50 ? '🟢 VERDE' : ftPct >= 20 ? '🟡 AMARILLO' : '🔴 ROJO'}`)

  // ── Category distribution ──────────────────────────────────────────────────

  console.log('\n' + DIVIDER)
  console.log('  CATALOG DISTRIBUTION BY CATEGORY')
  console.log(DIVIDER)
  console.log(`  ${'Category'.padEnd(16)} ${'Total'.padStart(6)} ${'ACTIVE'.padStart(8)} ${'DEGRADED'.padStart(10)} ${'Coverage'.padStart(10)}`)
  console.log('  ' + '─'.repeat(52))
  for (const cat of kpi.byCategory) {
    const catCoverage = pct(cat.total, MAX_SLOTS)
    console.log(
      `  ${cat.category.padEnd(16)}` +
      `${String(cat.total).padStart(6)}` +
      `${String(cat.active).padStart(8)}` +
      `${String(cat.imageDegraded).padStart(10)}` +
      `${catCoverage.padStart(10)}`,
    )
  }
  // Empty categories
  const allCategories = ['electronica','gaming','hogar','cocina','deporte','oficina','belleza','mascotas','bebes','herramientas']
  const assignedCats = new Set(kpi.byCategory.map(c => c.category))
  for (const cat of allCategories.filter(c => !assignedCats.has(c))) {
    console.log(`  ${cat.padEnd(16)}${'0'.padStart(6)}${'0'.padStart(8)}${'0'.padStart(10)}${'  0.0%'.padStart(10)}`)
  }

  // ── Slot sample ────────────────────────────────────────────────────────────

  console.log('\n  FIRST 10 CATALOG SLOTS')
  for (const p of report.assignedProducts.slice(0, 10)) {
    const state = p.displayState === 'active' ? '[ACT]' : '[DEG]'
    console.log(
      `  Slot ${String(p.slotIndex).padStart(3)} ${state} ${p.id.padEnd(14)} ${p.category.padEnd(14)} ${p.title.slice(0, 35)}`,
    )
  }
  if (report.assignedProducts.length > 10) {
    console.log(`  ... and ${report.assignedProducts.length - 10} more slots`)
  }

  // ── Post-build pool state ──────────────────────────────────────────────────

  if (!dryRun) {
    const poolAfter = getCandidatePool()
    console.log('\n  POST-BUILD POOL STATE')
    const statusCounts: Record<string, number> = {}
    for (const c of poolAfter.candidates) {
      statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1
    }
    Object.entries(statusCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => console.log(`  ${status.padEnd(20)}: ${count}`))
  }

  // ── Final verdict ──────────────────────────────────────────────────────────

  console.log('\n' + DIVIDER)
  console.log(`  Catalog built: ${report.slotsAssigned} products in ${report.durationMs}ms`)
  console.log(`  Working Coverage:    ${workingCoverage}%  (${kpi.filledSlots} products)`)
  console.log(`  Full Trust Coverage: ${fullTrustCoverage}%  (${kpi.activeCount} products with real images)`)
  if (!dryRun) {
    console.log('  Written to: data/tpe/trusted-catalog.json')
    console.log('  Pool updated: in_catalog candidates marked.')
  }
  console.log(DIVIDER + '\n')
}

main().catch(err => {
  console.error('\n  Catalog build failed:', err)
  process.exit(1)
})
