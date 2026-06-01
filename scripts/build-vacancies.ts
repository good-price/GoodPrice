/**
 * scripts/build-vacancies.ts
 *
 * Sprint 4B — Vacancy Engine
 *
 * Reads the Trusted Catalog, computes representation gaps against
 * the configured per-category target, generates a prioritised vacancy
 * queue, and writes data/tpe/vacancy-queue.json.
 *
 * Idempotent: safe to run at any time.  Existing vacancies are updated
 * in place (slotsNeeded, priority) rather than replaced, so audit history
 * is preserved.  Vacancies that were auto-filled since the last run are
 * marked status='filled'.
 *
 * Usage (from goodprice/ directory):
 *   npx tsx scripts/build-vacancies.ts
 *   npx tsx scripts/build-vacancies.ts --dry-run
 *   npx tsx scripts/build-vacancies.ts --target=15
 */

import {
  computeVacancies,
  computeKPI,
  PRIORITY_WEIGHT,
  ALL_CATEGORIES,
  DEFAULT_TARGET_PER_CATEGORY,
} from '@/lib/tpe/vacancy'
import { getTrustedCatalog } from '@/lib/tpe/catalog'
import type { VacancyPriority, Vacancy } from '@/types'

// ── CLI args ──────────────────────────────────────────────────────────────────

const dryRun    = process.argv.includes('--dry-run')
const targetArg = process.argv.find(a => a.startsWith('--target='))
const target    = targetArg
  ? parseInt(targetArg.split('=')[1], 10)
  : DEFAULT_TARGET_PER_CATEGORY

const DIVIDER = '─'.repeat(72)

// ── Formatting helpers ────────────────────────────────────────────────────────

function bar(value: number, total: number, width = 32): string {
  if (total === 0) return '░'.repeat(width)
  const filled = Math.round((value / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function pct(n: number, d: number, digits = 1): string {
  if (d === 0) return '0.0%'
  return ((n / d) * 100).toFixed(digits) + '%'
}

function priorityTag(p: VacancyPriority): string {
  return {
    critical: '[CRITICAL]',
    high:     '[HIGH]    ',
    medium:   '[MEDIUM]  ',
    low:      '[LOW]     ',
  }[p]
}

function deltaStr(delta: number): string {
  if (delta === 0) return '  =  '
  if (delta > 0)   return `+${delta}`.padStart(5)
  return String(delta).padStart(5)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const scriptStart = Date.now()

  // ── Pre-flight snapshot ────────────────────────────────────────────────────

  const catalog    = getTrustedCatalog()
  const filledSlots = catalog.slots.filter(Boolean).length
  const MAX_SLOTS  = 200

  console.log('\n' + DIVIDER)
  console.log('  GOODPRICE — Trusted Product Engine v1')
  console.log('  Sprint 4B: Vacancy Engine')
  console.log(DIVIDER)
  console.log(`  Dry run:          ${dryRun}`)
  console.log(`  Target/category:  ${target} slots`)
  console.log(`  Categories:       ${ALL_CATEGORIES.length}`)
  console.log(`  Total target:     ${ALL_CATEGORIES.length * target} slots`)
  console.log()
  console.log('  TRUSTED CATALOG PRE-FLIGHT')
  console.log(`  Filled slots:  ${filledSlots} / ${MAX_SLOTS}`)
  console.log(`  Empty slots:   ${MAX_SLOTS - filledSlots}`)
  console.log(`  Fill Rate:     ${pct(filledSlots, MAX_SLOTS)}`)
  if (dryRun) console.log('\n  [DRY RUN] Vacancy queue will NOT be written.')
  console.log()

  // ── Compute vacancies ──────────────────────────────────────────────────────

  const result = computeVacancies({
    targetPerCategory: target,
    allCategories:     ALL_CATEGORIES,
    dryRun,
  })

  const openVacancies = result.vacancies.filter(
    v => v.status === 'open' || v.status === 'in_progress',
  ).sort((a, b) => {
    const po: Record<VacancyPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    const d = po[a.priority] - po[b.priority]
    return d !== 0 ? d : b.slotsNeeded - a.slotsNeeded
  })

  const autoFilled  = result.vacancies.filter(v => v.status === 'filled')
  const deficitSnap = result.categorySnapshot.filter(s => s.status === 'deficit')
    .sort((a, b) => a.delta - b.delta)
  const surplusSnap = result.categorySnapshot.filter(s => s.status === 'surplus')
    .sort((a, b) => b.delta - a.delta)
  const balancedSnap = result.categorySnapshot.filter(s => s.status === 'balanced')

  // ── Vacancy queue diff ─────────────────────────────────────────────────────

  console.log(DIVIDER)
  console.log('  VACANCY QUEUE UPDATE')
  console.log(DIVIDER)
  console.log(`  Opened (new):    ${result.opened}`)
  console.log(`  Updated:         ${result.updated}`)
  console.log(`  Auto-filled:     ${result.filled}`)
  console.log(`  Unchanged:       ${result.unchanged}`)
  console.log()

  // ── Open vacancies ─────────────────────────────────────────────────────────

  if (openVacancies.length === 0) {
    console.log('  No open vacancies — catalog is fully balanced.')
  } else {
    console.log(DIVIDER)
    console.log('  OPEN VACANCIES (sorted by priority)')
    console.log(DIVIDER)
    console.log(`  ${'Priority'.padEnd(12)} ${'Category'.padEnd(16)} ${'Curr'.padStart(5)} ${'Tgt'.padStart(5)} ${'Need'.padStart(6)} ${'VSS'.padStart(5)}`)
    console.log('  ' + '─'.repeat(53))
    for (const v of openVacancies) {
      const vssContrib = v.slotsNeeded * PRIORITY_WEIGHT[v.priority]
      console.log(
        `  ${priorityTag(v.priority)} ${v.category.padEnd(16)}` +
        `${String(v.currentCount).padStart(5)}` +
        `${String(v.targetCount).padStart(5)}` +
        `${String(v.slotsNeeded).padStart(6)}` +
        `${String(vssContrib).padStart(6)}`,
      )
    }
  }

  // ── Category representation table ─────────────────────────────────────────

  console.log()
  console.log(DIVIDER)
  console.log('  CATEGORY REPRESENTATION (all categories)')
  console.log(DIVIDER)
  console.log(`  ${'Category'.padEnd(16)} ${'Current'.padStart(8)} ${'Target'.padStart(8)} ${'Delta'.padStart(7)} ${'State'.padEnd(12)} Bar`)
  console.log('  ' + '─'.repeat(70))

  for (const snap of result.categorySnapshot.slice().sort((a, b) => a.delta - b.delta)) {
    const stateLabel = snap.status === 'deficit'
      ? snap.delta <= -6 ? 'CRITICAL ▼' : snap.delta <= -4 ? 'HIGH ▼' : snap.delta <= -2 ? 'MEDIUM ▼' : 'LOW ▼'
      : snap.status === 'surplus'
        ? 'SURPLUS ▲'
        : 'BALANCED ='
    const barStr = bar(snap.currentCount, target * 2, 16)
    console.log(
      `  ${snap.category.padEnd(16)}` +
      `${String(snap.currentCount).padStart(8)}` +
      `${String(snap.targetCount).padStart(8)}` +
      `${deltaStr(snap.delta).padStart(7)}` +
      `  ${stateLabel.padEnd(12)} ${barStr}`,
    )
  }

  // ── Sub/over-represented breakdown ────────────────────────────────────────

  console.log()
  if (deficitSnap.length > 0) {
    console.log('  UNDER-REPRESENTED categories (deficit > 0):')
    for (const s of deficitSnap) {
      const slots = -s.delta
      const pri   = slots >= 6 ? 'CRITICAL' : slots >= 4 ? 'HIGH' : slots >= 2 ? 'MEDIUM' : 'LOW'
      console.log(`    ${s.category.padEnd(16)} needs ${slots} more slot${slots > 1 ? 's' : ''}  [${pri}]`)
    }
  }
  if (surplusSnap.length > 0) {
    console.log()
    console.log('  OVER-REPRESENTED categories (surplus > 0):')
    for (const s of surplusSnap) {
      console.log(`    ${s.category.padEnd(16)} ${s.delta > 0 ? '+' : ''}${s.delta} above target`)
    }
  }
  if (balancedSnap.length > 0) {
    console.log()
    console.log('  BALANCED categories (at target):')
    for (const s of balancedSnap) {
      console.log(`    ${s.category.padEnd(16)} ${s.currentCount} / ${s.targetCount}  ✓`)
    }
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const kpi = computeKPI()

  console.log()
  console.log(DIVIDER)
  console.log('  VACANCY KPIs')
  console.log(DIVIDER)
  console.log()

  // Vacancy Count
  console.log(`  Vacancy Count          ${kpi.vacancyCount}`)
  console.log(`  (open + in_progress vacancies)`)
  console.log()

  // Total slots needed
  console.log(`  Total Slots Needed     ${kpi.totalSlotsNeeded}`)
  console.log(`  (sum of all slotsNeeded across open vacancies)`)
  console.log()

  // VSS
  console.log(`  Vacancy Severity Score (VSS):  ${kpi.vacancySeverityScore}`)
  console.log(`  (critical×4 · high×3 · medium×2 · low×1, lower = better)`)
  console.log()
  const maxVss = kpi.totalSlotsNeeded * 4  // theoretical max (all critical)
  if (maxVss > 0) {
    const severity = kpi.vacancySeverityScore / maxVss
    const label = severity >= 0.75 ? '🔴 SEVERE'
      : severity >= 0.50 ? '🟠 ELEVATED'
      : severity >= 0.25 ? '🟡 MODERATE'
      : '🟢 MILD'
    console.log(`  VSS health: ${label}  (${kpi.vacancySeverityScore} / ${maxVss} max)`)
    console.log(`  ${bar(kpi.vacancySeverityScore, maxVss, 36)}`)
  } else {
    console.log('  VSS health: 🟢 PERFECT (no open vacancies)')
  }
  console.log()

  // Representation Balance
  console.log(`  Representation Balance:  ${kpi.representationBalance.toFixed(1)}%`)
  console.log(`  (% of categories within ±2 of target, 100% = perfect)`)
  const balLabel = kpi.representationBalance >= 80 ? '🟢 VERDE'
    : kpi.representationBalance >= 50 ? '🟡 AMARILLO'
    : '🔴 ROJO'
  console.log(`  Balance health: ${balLabel}`)
  console.log(`  ${bar(Math.round(kpi.representationBalance), 100, 36)}  ${kpi.representationBalance.toFixed(1)}%`)
  console.log()

  // Breakdown by priority
  const byPriority: Record<VacancyPriority, { count: number; slots: number; vss: number }> = {
    critical: { count: 0, slots: 0, vss: 0 },
    high:     { count: 0, slots: 0, vss: 0 },
    medium:   { count: 0, slots: 0, vss: 0 },
    low:      { count: 0, slots: 0, vss: 0 },
  }
  for (const v of openVacancies) {
    byPriority[v.priority].count++
    byPriority[v.priority].slots += v.slotsNeeded
    byPriority[v.priority].vss   += v.slotsNeeded * PRIORITY_WEIGHT[v.priority]
  }

  console.log(DIVIDER)
  console.log('  VACANCY BREAKDOWN BY PRIORITY')
  console.log(DIVIDER)
  console.log(`  ${'Priority'.padEnd(10)} ${'Vacancies'.padStart(10)} ${'Slots Needed'.padStart(14)} ${'VSS'.padStart(8)} ${'Weight'.padStart(8)}`)
  console.log('  ' + '─'.repeat(52))
  for (const pri of ['critical', 'high', 'medium', 'low'] as VacancyPriority[]) {
    const bp = byPriority[pri]
    if (bp.count === 0 && bp.slots === 0) continue
    console.log(
      `  ${pri.padEnd(10)}${String(bp.count).padStart(10)}${String(bp.slots).padStart(14)}${String(bp.vss).padStart(8)}   ×${PRIORITY_WEIGHT[pri]}`,
    )
  }
  console.log('  ' + '─'.repeat(52))
  console.log(
    `  ${'TOTAL'.padEnd(10)}${String(kpi.vacancyCount).padStart(10)}${String(kpi.totalSlotsNeeded).padStart(14)}${String(kpi.vacancySeverityScore).padStart(8)}`,
  )

  // ── Summary ───────────────────────────────────────────────────────────────

  const elapsed = Date.now() - scriptStart
  console.log()
  console.log(DIVIDER)
  console.log('  SPRINT 4B SUMMARY')
  console.log(DIVIDER)
  console.log()
  console.log(`  Catalog slots filled:      ${filledSlots} / ${MAX_SLOTS}  (${pct(filledSlots, MAX_SLOTS)})`)
  console.log(`  Target slots (${ALL_CATEGORIES.length} cats × ${target}):  ${ALL_CATEGORIES.length * target}`)
  console.log()
  console.log(`  Open vacancies:            ${kpi.vacancyCount}`)
  console.log(`  Slots still needed:        ${kpi.totalSlotsNeeded}`)
  console.log(`  Vacancy Severity Score:    ${kpi.vacancySeverityScore}`)
  console.log(`  Representation Balance:    ${kpi.representationBalance.toFixed(1)}%`)
  console.log()
  console.log('  Priority breakdown:')
  for (const pri of ['critical', 'high', 'medium', 'low'] as VacancyPriority[]) {
    const bp = byPriority[pri]
    if (bp.count === 0) continue
    console.log(`    ${pri.padEnd(10)} ${bp.count} vacanc${bp.count > 1 ? 'ies' : 'y'}  (${bp.slots} slots)`)
  }
  console.log()
  console.log(`  Duration:  ${elapsed}ms`)
  if (!dryRun) {
    console.log('  Written to: data/tpe/vacancy-queue.json')
  }
  console.log(DIVIDER + '\n')
}

main().catch(err => {
  console.error('\n  Sprint 4B vacancy build failed:', err)
  process.exit(1)
})
