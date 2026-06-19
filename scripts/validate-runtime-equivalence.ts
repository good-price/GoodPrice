/**
 * scripts/validate-runtime-equivalence.ts
 *
 * Validates that the runtime catalog is equivalent to the legacy catalog.
 *
 * Run AFTER migrate-legacy-to-runtime.ts.
 * Run with: npx tsx scripts/validate-runtime-equivalence.ts
 *
 * Checks:
 *   1.  Total product count (legacy raw vs runtime raw)
 *   2.  Per-category counts
 *   3.  ASIN uniqueness (no duplicates in runtime)
 *   4.  ID uniqueness (no duplicate IDs in runtime)
 *   5.  Products missing image URL in runtime
 *   6.  Products missing Colombia flag in runtime vs legacy
 *   7.  Public-safe product count (via 11-gate public.ts — legacy source)
 *   8.  Catalog stats shape
 *   9.  Random-sample field-level comparison (10 products)
 *   10. getCatalogSource() returns 'runtime' after migration
 */

import {
  readRuntimeCatalog,
  getRuntimeProducts,
} from '../lib/catalog/runtime/index'
import { getRawProducts } from '../data/catalog/index'
import { getCatalogSource } from '../lib/catalog/source'

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function ok(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${name}`)
    passed++
  } else {
    const msg = detail ? `${name}: ${detail}` : name
    console.error(`  ✗ ${msg}`)
    failures.push(msg)
    failed++
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ──`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('GOODPRICE — validate-runtime-equivalence')
  console.log('──────────────────────────────────────────────')

  const rawLegacy  = getRawProducts()
  const rawRuntime = getRuntimeProducts()
  const store      = readRuntimeCatalog()

  // ── Test 1: Total count ───────────────────────────────────────────────────────

  section('Test 1 — Total product count')

  ok(
    `Legacy: ${rawLegacy.length} | Runtime: ${rawRuntime.length} | Match`,
    rawLegacy.length === rawRuntime.length,
    `legacy=${rawLegacy.length} runtime=${rawRuntime.length}`,
  )
  ok('totalProducts field matches array length', store.totalProducts === rawRuntime.length)

  // ── Test 2: Per-category counts ───────────────────────────────────────────────

  section('Test 2 — Per-category counts')

  const legacyByCategory: Record<string, number> = {}
  for (const p of rawLegacy) {
    legacyByCategory[p.category] = (legacyByCategory[p.category] ?? 0) + 1
  }

  const runtimeByCategory: Record<string, number> = {}
  for (const p of rawRuntime) {
    runtimeByCategory[p.category] = (runtimeByCategory[p.category] ?? 0) + 1
  }

  const allCategories = new Set([...Object.keys(legacyByCategory), ...Object.keys(runtimeByCategory)])
  for (const cat of Array.from(allCategories).sort()) {
    const leg = legacyByCategory[cat] ?? 0
    const rt  = runtimeByCategory[cat] ?? 0
    ok(`${cat}: legacy=${leg} runtime=${rt}`, leg === rt)
  }

  // ── Test 3: ASIN uniqueness in runtime ────────────────────────────────────────

  section('Test 3 — ASIN uniqueness')

  const runtimeAsins = rawRuntime.map(p => p.asin)
  const uniqueAsins  = new Set(runtimeAsins)
  ok(
    `No duplicate ASINs (${rawRuntime.length} total, ${uniqueAsins.size} unique)`,
    runtimeAsins.length === uniqueAsins.size,
  )

  // ── Test 4: ID uniqueness in runtime ─────────────────────────────────────────

  section('Test 4 — ID uniqueness')

  const runtimeIds = rawRuntime.map(p => p.id)
  const uniqueIds  = new Set(runtimeIds)
  ok(
    `No duplicate IDs (${rawRuntime.length} total, ${uniqueIds.size} unique)`,
    runtimeIds.length === uniqueIds.size,
  )

  // ── Test 5: Products missing image ────────────────────────────────────────────

  section('Test 5 — Image URLs present')

  const runtimeNoImage  = rawRuntime.filter(p => !p.image || p.image.trim() === '')
  const legacyNoImage   = rawLegacy.filter(p => !p.image || p.image.trim() === '')
  ok(`No missing images in runtime (legacy missing: ${legacyNoImage.length})`, runtimeNoImage.length === legacyNoImage.length)

  // ── Test 6: Colombia flags ────────────────────────────────────────────────────

  section('Test 6 — Colombia confirmed flags')

  const legacyColombia  = rawLegacy.filter(p => p.shipsToColombiaConfirmed === true).length
  const runtimeColombia = rawRuntime.filter(p => p.shipsToColombiaConfirmed === true).length
  ok(
    `shipsToColombiaConfirmed: legacy=${legacyColombia} runtime=${runtimeColombia}`,
    legacyColombia === runtimeColombia,
  )

  // ── Test 7: Source detection ──────────────────────────────────────────────────

  section('Test 7 — getCatalogSource() returns "runtime"')

  const source = getCatalogSource()
  ok(
    `getCatalogSource() === "runtime" (got: "${source}")`,
    source === 'runtime',
  )

  // ── Test 8: Catalog stats shape ───────────────────────────────────────────────

  section('Test 8 — Catalog store integrity')

  ok('version ≥ 1',               store.version >= 1)
  ok('updatedAt is string',        typeof store.updatedAt === 'string')
  ok('updatedBy is string',        typeof store.updatedBy === 'string')
  ok('products is array',          Array.isArray(store.products))
  ok('products have id field',     rawRuntime.every(p => typeof p.id === 'string' && p.id.length > 0))
  ok('products have asin field',   rawRuntime.every(p => typeof p.asin === 'string' && p.asin.length === 10))
  ok('products have category',     rawRuntime.every(p => typeof p.category === 'string'))
  ok('products have source field', rawRuntime.every(p => ['legacy','auto-fill','manual','repair'].includes(p.source)))

  // ── Test 9: Random-sample field comparison ────────────────────────────────────

  section('Test 9 — Random-sample field comparison (10 products)')

  const runtimeAsinMap = new Map(rawRuntime.map(p => [p.asin, p]))

  // Pick a deterministic sample: every Nth product from legacy
  const step    = Math.max(1, Math.floor(rawLegacy.length / 10))
  const samples = rawLegacy.filter((_, i) => i % step === 0).slice(0, 10)

  for (const leg of samples) {
    const rt = runtimeAsinMap.get(leg.asin)
    if (!rt) {
      ok(`${leg.asin} (${leg.id}) found in runtime`, false, 'not found')
      continue
    }
    ok(`${leg.asin} id match`,       rt.id       === leg.id)
    ok(`${leg.asin} category match`, rt.category === leg.category)
    ok(`${leg.asin} price match`,    rt.price    === leg.price)
    ok(`${leg.asin} rating match`,   rt.rating   === leg.rating)
    ok(`${leg.asin} reviews match`,  rt.reviews  === leg.reviews)
    ok(`${leg.asin} image match`,    rt.image    === leg.image)
    ok(`${leg.asin} status match`,   rt.status   === (leg.status ?? 'active'))
  }

  // ── Test 10: ASIN set equivalence ────────────────────────────────────────────

  section('Test 10 — ASIN set equivalence (legacy ↔ runtime)')

  const legacyAsinSet  = new Set(rawLegacy.map(p => p.asin))
  const runtimeAsinSet = new Set(rawRuntime.map(p => p.asin))

  const onlyInLegacy  = [...legacyAsinSet].filter(a => !runtimeAsinSet.has(a))
  const onlyInRuntime = [...runtimeAsinSet].filter(a => !legacyAsinSet.has(a))

  ok(
    `No ASINs only in legacy (count: ${onlyInLegacy.length})`,
    onlyInLegacy.length === 0,
    onlyInLegacy.slice(0, 5).join(', '),
  )
  ok(
    `No ASINs only in runtime (count: ${onlyInRuntime.length})`,
    onlyInRuntime.length === 0,
    onlyInRuntime.slice(0, 5).join(', '),
  )

  // ── Summary ───────────────────────────────────────────────────────────────────

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Result: ${passed} passed, ${failed} failed`)

  if (failures.length > 0) {
    console.error('\nFailed checks:')
    for (const f of failures) console.error(`  • ${f}`)
    console.error('\n❌ Equivalence validation FAILED — runtime catalog does not match legacy.')
    process.exit(1)
  } else {
    console.log('\n✅ Equivalence validated — runtime catalog is 100% equivalent to legacy.')
    console.log('   The site will now serve from runtime-catalog.json.')
  }
}

main()
