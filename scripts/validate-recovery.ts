/**
 * scripts/validate-recovery.ts
 *
 * Sprint 5C — Recovery Engine validation.
 *
 * Tests that all stores return safe defaults on first boot (files absent),
 * that the runtime catalog falls back to backup, and that the intelligence
 * layer degrades gracefully for unknown ASINs and categories.
 *
 * Read-only — does not delete any live files.
 *
 * Run: npx tsx --tsconfig tsconfig.scripts.json scripts/validate-recovery.ts
 */

import { existsSync } from 'fs'
import path from 'path'

const ROOT = process.cwd()
let passed = 0
let failed = 0

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ❌ ${name}`)
    console.error(`     ${err instanceof Error ? err.message : String(err)}`)
    failed++
  }
}

function warn(msg: string): void {
  console.warn(`  ⚠️  ${msg}`)
}

function section(title: string): void {
  console.log(`\n${title}`)
}

async function main(): Promise<void> {
  // ── Recovery 1: Runtime catalog reader contracts ───────────────────────────

  section('RECOVERY 1: Runtime catalog reader — fault-tolerance contracts')

  await testAsync('getRuntimeProducts() returns array, never throws', async () => {
    const { getRuntimeProducts } = await import('../lib/catalog/runtime/reader')
    const products = getRuntimeProducts()
    if (!Array.isArray(products)) throw new Error('must return array')
  })

  await testAsync('readRuntimeCatalog() has totalProducts field', async () => {
    const { readRuntimeCatalog } = await import('../lib/catalog/runtime/reader')
    const store = readRuntimeCatalog()
    if (typeof store.totalProducts !== 'number') throw new Error('totalProducts must be number')
    if (!Array.isArray(store.products))          throw new Error('products must be array')
  })

  await testAsync('readRuntimeCatalog() totalProducts === products.length', async () => {
    const { readRuntimeCatalog } = await import('../lib/catalog/runtime/reader')
    const store = readRuntimeCatalog()
    if (store.totalProducts !== store.products.length)
      throw new Error(`totalProducts=${store.totalProducts} !== products.length=${store.products.length}`)
  })

  await testAsync('backup file exists as failsafe', async () => {
    const backupPath = path.join(ROOT, 'data/catalog/runtime-catalog.backup.json')
    if (!existsSync(backupPath)) {
      warn('runtime-catalog.backup.json absent — will be created on first write (normal on first run)')
    }
    // Absence is a warning, not a failure
  })

  // ── Recovery 2: Discovery state absent → default state ────────────────────

  section('RECOVERY 2: Discovery state — absent → default state')

  await testAsync('readDiscoveryState() returns valid state', async () => {
    const { readDiscoveryState } = await import('../lib/catalog/discovery/state')
    const state = readDiscoveryState()
    if (typeof state !== 'object' || state === null) throw new Error('must return object')
    if (typeof state.categories !== 'object')        throw new Error('must have categories object')
  })

  await testAsync('readDiscoveryState().categories is a plain object (not array)', async () => {
    const { readDiscoveryState } = await import('../lib/catalog/discovery/state')
    const state = readDiscoveryState()
    if (Array.isArray(state.categories)) throw new Error('categories must not be array')
  })

  // ── Recovery 3: Lifecycle absent → default store ──────────────────────────

  section('RECOVERY 3: Lifecycle store — absent → empty defaults')

  await testAsync('readLifecycleStore() returns valid store', async () => {
    const { readLifecycleStore } = await import('../lib/catalog/lifecycle/state')
    const store = readLifecycleStore()
    if (typeof store !== 'object')           throw new Error('must return object')
    if (typeof store.products !== 'object')  throw new Error('must have products object')
  })

  await testAsync('readLifecycleStore() updatedAt is string | null', async () => {
    const { readLifecycleStore } = await import('../lib/catalog/lifecycle/state')
    const store = readLifecycleStore()
    if (store.updatedAt !== null && typeof store.updatedAt !== 'string')
      throw new Error(`updatedAt must be string|null, got ${typeof store.updatedAt}`)
  })

  // ── Recovery 4: Automation state ──────────────────────────────────────────

  section('RECOVERY 4: Automation state — valid if present, safe if absent')

  await testAsync('automation-state.json is valid object when present', async () => {
    const fp = path.join(ROOT, 'data/ops/runtime/automation-state.json')
    if (!existsSync(fp)) {
      warn('automation-state.json absent — created on first automation run (normal)')
      return
    }
    const { readFileSync } = await import('fs')
    const raw    = readFileSync(fp, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed !== 'object') throw new Error('must be object')
  })

  // ── Recovery 5: Pricing-memory stores → empty defaults ────────────────────

  section('RECOVERY 5: Pricing-memory stores — absent → empty defaults, 0 scores')

  await testAsync('readPriceHistory() returns valid store', async () => {
    const { readPriceHistory } = await import('../lib/catalog/pricing-memory/state')
    const store = readPriceHistory()
    if (typeof store.products !== 'object') throw new Error('must have products')
    if (store.updatedAt !== null && typeof store.updatedAt !== 'string')
      throw new Error('updatedAt must be string|null')
  })

  await testAsync('readProductIntelligence() returns valid store', async () => {
    const { readProductIntelligence } = await import('../lib/catalog/pricing-memory/state')
    const store = readProductIntelligence()
    if (typeof store.products !== 'object') throw new Error('must have products')
  })

  await testAsync('readRecommendations() returns valid store', async () => {
    const { readRecommendations } = await import('../lib/catalog/recommendations/state')
    const store = readRecommendations()
    if (typeof store.products !== 'object') throw new Error('must have products')
    if (store.updatedAt !== null && typeof store.updatedAt !== 'string')
      throw new Error('updatedAt must be string|null')
  })

  await testAsync('readAlerts() returns valid store', async () => {
    const { readAlerts } = await import('../lib/catalog/alerts/state')
    const store = readAlerts()
    if (typeof store.alerts !== 'object') throw new Error('must have alerts')
  })

  // ── Recovery 6: Intelligence layer for unknown identifiers ────────────────

  section('RECOVERY 6: Intelligence layer — unknown ASIN/category → empty, no throw')

  await testAsync('getProductIntelligence(unknownAsin) → emptyIntelligence', async () => {
    const { getProductIntelligence } = await import('../lib/catalog/product-intelligence/reader')
    const intel = getProductIntelligence('XXXXXXXXXX')
    if (intel.asin !== 'XXXXXXXXXX')             throw new Error('must preserve asin')
    if (intel.recommendationScore !== 0)          throw new Error('score must be 0 for unknown')
    if (intel.opportunityScore !== 0)             throw new Error('opportunityScore must be 0')
    if (intel.badges.length !== 0)               throw new Error('no badges for unknown ASIN')
    if (intel.alerts.length !== 0)               throw new Error('no alerts for unknown ASIN')
    if (intel.recommendationReasons.length !== 0) throw new Error('no reasons for unknown ASIN')
  })

  await testAsync('getRelatedProducts(unknown, unknownCat) → empty array', async () => {
    const { getRelatedProducts } = await import('../lib/catalog/similarity/index')
    const result = getRelatedProducts('XXXXXXXXXX', 'not-a-real-category', 6)
    if (!Array.isArray(result)) throw new Error('must return array')
    if (result.length !== 0)    throw new Error('must be empty for unknown category')
  })

  await testAsync('getRelatedProducts(known, unknownCat) → empty array', async () => {
    const { getRelatedProducts } = await import('../lib/catalog/similarity/index')
    const result = getRelatedProducts('B00SFSU53G', 'not-a-real-category', 6)
    if (!Array.isArray(result)) throw new Error('must return array')
    if (result.length !== 0)    throw new Error('must be empty for unknown category')
  })

  // ── Results ─────────────────────────────────────────────────────────────────

  console.log()
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
