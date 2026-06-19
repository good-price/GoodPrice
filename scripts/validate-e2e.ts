/**
 * scripts/validate-e2e.ts
 *
 * Sprint H1 — End-to-end pipeline validation.
 *
 * Exercises the full local pipeline:
 *   runtime → lifecycle → pricing → recommendations → alerts
 *   → intelligence → product page → category page
 *
 * Amazon HTTP discovery is NOT tested (requires network + credentials).
 *
 * Run: npx tsx --tsconfig tsconfig.scripts.json scripts/validate-e2e.ts
 */

import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'

const ROOT = process.cwd()
let passed = 0
let failed = 0
const results: Array<{ name: string; status: 'PASS' | 'FAIL'; error?: string }> = []

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`  ✅ ${name}`)
    passed++
    results.push({ name, status: 'PASS' })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ ${name}`)
    console.error(`     ${error}`)
    failed++
    results.push({ name, status: 'FAIL', error })
  }
}

function warn(msg: string): void {
  console.warn(`  ⚠️  ${msg}`)
}

function section(title: string): void {
  console.log(`\n${title}`)
}

async function main(): Promise<void> {
  let sampleAsin     = ''
  let sampleCategory = ''

  // ── E2E 1: Preconditions ──────────────────────────────────────────────────

  section('E2E 1: Preconditions — runtime catalog populated')

  await testAsync('runtime catalog has ≥ 1 products', async () => {
    const { getRuntimeProducts } = await import('../lib/catalog/runtime/reader')
    const products = getRuntimeProducts()
    if (products.length === 0)
      throw new Error('runtime catalog is empty — run catalog seed first')
    sampleAsin     = products[0].asin
    sampleCategory = products[0].category
    console.log(`     sampleAsin=${sampleAsin}  sampleCategory=${sampleCategory}`)
  })

  await testAsync('totalProducts === products.length invariant holds', async () => {
    const { readRuntimeCatalog } = await import('../lib/catalog/runtime/reader')
    const store = readRuntimeCatalog()
    if (store.totalProducts !== store.products.length)
      throw new Error(`totalProducts=${store.totalProducts} !== products.length=${store.products.length}`)
  })

  // ── E2E 2: Lifecycle sync ─────────────────────────────────────────────────

  section('E2E 2: syncLifecycleFromRuntimeCatalog()')

  await testAsync('sync returns > 0 products seeded', async () => {
    const { syncLifecycleFromRuntimeCatalog } = await import('../lib/catalog/lifecycle/state')
    const count = syncLifecycleFromRuntimeCatalog()
    if (count === 0) throw new Error('sync returned 0')
    console.log(`     seeded ${count} lifecycle entries`)
  })

  await testAsync('lifecycle store has entry for sample ASIN', async () => {
    const { readLifecycleStore } = await import('../lib/catalog/lifecycle/state')
    if (!sampleAsin) { warn('skipped — no sample ASIN'); return }
    const store = readLifecycleStore()
    if (!store.products[sampleAsin])
      throw new Error(`no lifecycle entry for ${sampleAsin}`)
  })

  await testAsync('lifecycle store updatedAt is string or null', async () => {
    const { readLifecycleStore } = await import('../lib/catalog/lifecycle/state')
    const store = readLifecycleStore()
    if (typeof store.updatedAt !== 'string' && store.updatedAt !== null)
      throw new Error(`updatedAt must be string or null, got ${typeof store.updatedAt}`)
  })

  // ── E2E 3: Pricing scan ───────────────────────────────────────────────────

  section('E2E 3: runPricingScan()')

  await testAsync('runPricingScan() returns valid object', async () => {
    const { runPricingScan } = await import('../lib/catalog/pricing-memory/index')
    const result = runPricingScan()
    if (typeof result !== 'object' || result === null)
      throw new Error('must return object')
    if (typeof result.productsScanned !== 'number')
      throw new Error('must have productsScanned count')
    console.log(`     productsScanned=${result.productsScanned}`)
  })

  await testAsync('price history store valid after scan', async () => {
    const { readPriceHistory } = await import('../lib/catalog/pricing-memory/state')
    const store = readPriceHistory()
    if (typeof store.products !== 'object') throw new Error('must have products object')
  })

  // ── E2E 4: Recommendation scan ────────────────────────────────────────────

  section('E2E 4: runRecommendationScan()')

  await testAsync('runRecommendationScan() returns valid object', async () => {
    const { runRecommendationScan } = await import('../lib/catalog/recommendations/index')
    const result = runRecommendationScan()
    if (typeof result !== 'object' || result === null)
      throw new Error('must return object')
    console.log(`     productsProcessed=${result.productsProcessed ?? 'n/a'}`)
  })

  await testAsync('recommendations store has products map after scan', async () => {
    const { readRecommendations } = await import('../lib/catalog/recommendations/state')
    const store = readRecommendations()
    if (typeof store.products !== 'object') throw new Error('must have products object')
  })

  // ── E2E 5: Alert scan ─────────────────────────────────────────────────────

  section('E2E 5: runAlertScan()')

  await testAsync('runAlertScan() returns valid object', async () => {
    const { runAlertScan } = await import('../lib/catalog/alerts/index')
    const result = runAlertScan()
    if (typeof result !== 'object' || result === null)
      throw new Error('must return object')
    console.log(`     newAlerts=${result.newAlerts ?? 'n/a'}`)
  })

  await testAsync('alerts store has alerts map after scan', async () => {
    const { readAlerts } = await import('../lib/catalog/alerts/state')
    const store = readAlerts()
    if (typeof store.alerts !== 'object') throw new Error('must have alerts object')
  })

  // ── E2E 6: Product intelligence ───────────────────────────────────────────

  section('E2E 6: getProductIntelligence(sampleAsin) — post-pipeline')

  await testAsync('getProductIntelligence(sampleAsin) returns valid object', async () => {
    const { getProductIntelligence } = await import('../lib/catalog/product-intelligence/reader')
    if (!sampleAsin) { warn('skipped — no sample ASIN'); return }
    const intel = getProductIntelligence(sampleAsin)
    if (!intel || typeof intel.asin !== 'string')
      throw new Error('must return object with asin')
    if (typeof intel.recommendationScore !== 'number')
      throw new Error('score must be number')
    if (!Array.isArray(intel.badges))
      throw new Error('badges must be array')
    if (!Array.isArray(intel.recommendationReasons))
      throw new Error('reasons must be array')
    if (!Array.isArray(intel.alerts))
      throw new Error('alerts must be array')
    console.log(`     score=${intel.recommendationScore}  badges=${intel.badges.length}`)
  })

  await testAsync('getProductIntelligence(unknownAsin) → score 0', async () => {
    const { getProductIntelligence } = await import('../lib/catalog/product-intelligence/reader')
    const intel = getProductIntelligence('E2E_UNKNOWN_X')
    if (intel.recommendationScore !== 0) throw new Error('unknown ASIN must score 0')
    if (intel.badges.length !== 0)       throw new Error('unknown ASIN must have 0 badges')
  })

  // ── E2E 7: Product page data assembly ─────────────────────────────────────

  section('E2E 7: Product page data assembly')

  await testAsync('getRuntimeProductByAsin(sampleAsin) returns product', async () => {
    const { getRuntimeProductByAsin } = await import('../lib/catalog/runtime/reader')
    if (!sampleAsin) { warn('skipped — no sample ASIN'); return }
    const product = getRuntimeProductByAsin(sampleAsin)
    if (!product) throw new Error(`product not found: ${sampleAsin}`)
    if (typeof product.title !== 'string') throw new Error('product must have title')
    if (typeof product.price !== 'number') throw new Error('product must have price')
    console.log(`     title="${product.title.slice(0, 40)}..."`)
  })

  await testAsync('product page data contract: asin + score + badges + reasons', async () => {
    const { getProductIntelligence } = await import('../lib/catalog/product-intelligence/reader')
    const { getRuntimeProductByAsin } = await import('../lib/catalog/runtime/reader')
    if (!sampleAsin) { warn('skipped'); return }
    const product = getRuntimeProductByAsin(sampleAsin)
    const intel   = getProductIntelligence(sampleAsin)
    if (!product) throw new Error('product not found in runtime catalog')
    if (intel.asin !== sampleAsin) throw new Error('asin mismatch')
    if (typeof intel.recommendationScore !== 'number') throw new Error('score not number')
  })

  // ── E2E 8: Category page data assembly ────────────────────────────────────

  section('E2E 8: Category page data assembly')

  await testAsync('getRuntimeCategoryProducts(sampleCategory) returns ≥ 1 product', async () => {
    const { getRuntimeCategoryProducts } = await import('../lib/catalog/runtime/reader')
    if (!sampleCategory) { warn('skipped — no sample category'); return }
    const products = getRuntimeCategoryProducts(sampleCategory)
    if (!Array.isArray(products)) throw new Error('must return array')
    if (products.length === 0)
      throw new Error(`no products for category ${sampleCategory}`)
    console.log(`     ${products.length} products in category ${sampleCategory}`)
  })

  await testAsync('getRelatedProducts(sampleAsin, sampleCategory) returns array', async () => {
    const { getRelatedProducts } = await import('../lib/catalog/similarity/index')
    if (!sampleAsin || !sampleCategory) { warn('skipped'); return }
    const result = getRelatedProducts(sampleAsin, sampleCategory, 4)
    if (!Array.isArray(result)) throw new Error('must return array')
    console.log(`     ${result.length} related products`)
  })

  // ── Store consistency check ───────────────────────────────────────────────

  section('E2E 9: Cross-store reference consistency')

  await testAsync('every recommendation ASIN exists in runtime catalog', async () => {
    const { getRuntimeProducts }  = await import('../lib/catalog/runtime/reader')
    const { readRecommendations } = await import('../lib/catalog/recommendations/state')
    const runtimeAsins = new Set(getRuntimeProducts().map(p => p.asin))
    const recStore     = readRecommendations()
    const orphans      = Object.keys(recStore.products).filter(asin => !runtimeAsins.has(asin))
    if (orphans.length > 0)
      throw new Error(`${orphans.length} orphan ASINs in recommendations: ${orphans.slice(0, 3).join(', ')}`)
  })

  await testAsync('every alert ASIN exists in runtime catalog', async () => {
    const { getRuntimeProducts } = await import('../lib/catalog/runtime/reader')
    const { readAlerts }         = await import('../lib/catalog/alerts/state')
    const runtimeAsins = new Set(getRuntimeProducts().map(p => p.asin))
    const alertStore   = readAlerts()
    const orphans      = Object.keys(alertStore.alerts).filter(asin => !runtimeAsins.has(asin))
    if (orphans.length > 0)
      throw new Error(`${orphans.length} orphan ASINs in alerts: ${orphans.slice(0, 3).join(', ')}`)
  })

  await testAsync('every lifecycle entry ASIN exists in runtime catalog', async () => {
    const { getRuntimeProducts } = await import('../lib/catalog/runtime/reader')
    const { readLifecycleStore } = await import('../lib/catalog/lifecycle/state')
    const runtimeAsins   = new Set(getRuntimeProducts().map(p => p.asin))
    const lifecycleAsins = Object.keys(readLifecycleStore().products)
    const orphans        = lifecycleAsins.filter(asin => !runtimeAsins.has(asin))
    if (orphans.length > 0)
      throw new Error(`${orphans.length} orphan ASINs in lifecycle: ${orphans.slice(0, 3).join(', ')}`)
  })

  // ── Generate e2e-report.json ──────────────────────────────────────────────

  const reportDir  = path.join(ROOT, 'docs', 'reports')
  const reportPath = path.join(reportDir, 'e2e-report.json')
  const report = {
    generatedAt:  new Date().toISOString(),
    passed,
    failed,
    total:        passed + failed,
    status:       failed === 0 ? 'PASS' : 'FAIL',
    results,
  }

  try {
    mkdirSync(reportDir, { recursive: true })
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
    console.log(`\n  📄 e2e-report.json saved`)
  } catch {
    console.error('  ⚠️  Could not save e2e-report.json')
  }

  console.log()
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
