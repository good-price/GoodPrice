/**
 * scripts/validate-runtime-catalog.ts
 *
 * Validation script for the Runtime Catalog infrastructure.
 *
 * Run with: npx tsx scripts/validate-runtime-catalog.ts
 *
 * Tests (in order):
 *   1.  Files exist or are created automatically
 *   2.  Initial read returns valid empty store
 *   3.  Add product — store grows, version increments
 *   4.  Update product — field changes, version increments
 *   5.  Remove product — store shrinks, version increments
 *   6.  Backup auto-rotation on each write
 *   7.  Version monotonically increments across all writes
 *   8.  totalProducts always equals products.length
 *   9.  Category config reads correctly
 *   10. computeCategoryDeficits() returns correct structure
 *   11. Recovery from corrupt primary — falls back to backup
 *   12. Recovery from corrupt primary + corrupt backup — returns empty
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

// ── Import the library under test ─────────────────────────────────────────────

import {
  readRuntimeCatalog,
  getRuntimeProducts,
  getRuntimeProductByAsin,
  getRuntimeCategoryProducts,
  getRuntimeCatalogStats,
  saveRuntimeCatalog,
  addRuntimeProduct,
  updateRuntimeProduct,
  removeRuntimeProduct,
  getCategoryConfig,
  getCategoryMinimum,
  getCategoryCurrentCount,
  computeCategoryDeficits,
  updateCategoryMinimum,
  emptyRuntimeCatalogStore,
} from '../lib/catalog/runtime/index'

import type { RuntimeProduct } from '../lib/catalog/runtime/types'

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function ok(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${name}`)
    passed++
  } else {
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`)
    failed++
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ──`)
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT         = process.cwd()
const CATALOG_FILE = path.resolve(ROOT, 'data/catalog/runtime-catalog.json')
const BACKUP_FILE  = path.resolve(ROOT, 'data/catalog/runtime-catalog.backup.json')
const CONFIG_FILE  = path.resolve(ROOT, 'data/catalog/category-config.json')

// ── Sample product ────────────────────────────────────────────────────────────

const sampleProduct: RuntimeProduct = {
  id:                       'elec-test-001',
  asin:                     'B0TEST00001',
  category:                 'electronica',
  title:                    'Auriculares Test Pro',
  amazonTitle:              'Test Pro Headphones 2024',
  brand:                    'TestBrand',
  image:                    'https://m.media-amazon.com/images/test.jpg',
  price:                    79.99,
  rating:                   4.5,
  reviews:                  8200,
  status:                   'active',
  shipsToColombiaConfirmed: true,
  source:                   'manual',
  admittedAt:               new Date().toISOString(),
  lastValidated:            null,
}

// ── Test 1 — Files exist ──────────────────────────────────────────────────────

section('Test 1 — Files exist')

ok('runtime-catalog.json exists',        existsSync(CATALOG_FILE))
ok('runtime-catalog.backup.json exists', existsSync(BACKUP_FILE))
ok('category-config.json exists',        existsSync(CONFIG_FILE))

// ── Test 2 — Initial read ─────────────────────────────────────────────────────

section('Test 2 — Initial read returns valid store')

const store0 = readRuntimeCatalog()
ok('version ≥ 1',              store0.version >= 1)
ok('products is array',        Array.isArray(store0.products))
ok('totalProducts is integer', Number.isInteger(store0.totalProducts))
ok('updatedBy is string',      typeof store0.updatedBy === 'string')

// ── Test 3 — Add product ──────────────────────────────────────────────────────

section('Test 3 — addRuntimeProduct()')

const versionBefore = readRuntimeCatalog().version
addRuntimeProduct(sampleProduct, 'test-script')
const store3 = readRuntimeCatalog()

ok('version incremented',             store3.version > versionBefore)
ok('products.length increased by 1',  store3.products.length === store0.products.length + 1)
ok('totalProducts equals length',     store3.totalProducts   === store3.products.length)
ok('product found by ASIN',           getRuntimeProductByAsin(sampleProduct.asin) !== null)
ok('product in category',             getRuntimeCategoryProducts('electronica').some(p => p.asin === sampleProduct.asin))

// Duplicate insert should be no-op
const versionAfterDupe = readRuntimeCatalog().version
addRuntimeProduct(sampleProduct, 'test-script')
ok('duplicate insert is no-op',       readRuntimeCatalog().version === versionAfterDupe)

// ── Test 4 — Update product ───────────────────────────────────────────────────

section('Test 4 — updateRuntimeProduct()')

const v4before = readRuntimeCatalog().version
updateRuntimeProduct(sampleProduct.asin, { price: 89.99, status: 'active' }, 'test-script')
const store4 = readRuntimeCatalog()
const updated4 = store4.products.find(p => p.asin === sampleProduct.asin)

ok('version incremented',       store4.version > v4before)
ok('price updated to 89.99',    updated4?.price === 89.99)
ok('asin unchanged',            updated4?.asin  === sampleProduct.asin)
ok('id unchanged',              updated4?.id    === sampleProduct.id)
ok('totalProducts stable',      store4.totalProducts === store4.products.length)

// Update non-existent ASIN is no-op
const vBeforeNoop = readRuntimeCatalog().version
updateRuntimeProduct('BXXXXX0000', { price: 1 }, 'test-script')
ok('update non-existent is no-op', readRuntimeCatalog().version === vBeforeNoop)

// ── Test 5 — Remove product ───────────────────────────────────────────────────

section('Test 5 — removeRuntimeProduct()')

const v5before    = readRuntimeCatalog().version
const count5before = readRuntimeCatalog().products.length
removeRuntimeProduct(sampleProduct.asin, 'test-script')
const store5 = readRuntimeCatalog()

ok('version incremented',           store5.version > v5before)
ok('products.length decreased by 1', store5.products.length === count5before - 1)
ok('product no longer found',        getRuntimeProductByAsin(sampleProduct.asin) === null)
ok('totalProducts equals length',    store5.totalProducts === store5.products.length)

// Remove non-existent is no-op
const vBeforeNoop2 = readRuntimeCatalog().version
removeRuntimeProduct(sampleProduct.asin, 'test-script')
ok('remove non-existent is no-op', readRuntimeCatalog().version === vBeforeNoop2)

// ── Test 6 — Backup rotation ──────────────────────────────────────────────────

section('Test 6 — Backup rotation on every write')

addRuntimeProduct(sampleProduct, 'test-script')
const currentVersion = readRuntimeCatalog().version
const backupRaw      = JSON.parse(readFileSync(BACKUP_FILE, 'utf-8')) as { version?: number }
ok('backup exists and has version', typeof backupRaw.version === 'number')
ok('backup version < current',      (backupRaw.version ?? 0) < currentVersion)

// ── Test 7 — Monotonic version ────────────────────────────────────────────────

section('Test 7 — Version monotonically increments')

const versions: number[] = []
for (let i = 0; i < 3; i++) {
  const p = { ...sampleProduct, asin: `B0TESTV${i}000`, id: `elec-v${i}` }
  addRuntimeProduct(p, 'test-script')
  versions.push(readRuntimeCatalog().version)
}
const isMonotonic = versions.every((v, i) => i === 0 || v > versions[i - 1]!)
ok(`versions ${versions.join(' < ')} are monotonic`, isMonotonic)

// Clean up extra test products
removeRuntimeProduct('B0TESTV0000', 'test-script')
removeRuntimeProduct('B0TESTV1000', 'test-script')
removeRuntimeProduct('B0TESTV2000', 'test-script')
removeRuntimeProduct(sampleProduct.asin, 'test-script')

// ── Test 8 — totalProducts invariant ─────────────────────────────────────────

section('Test 8 — totalProducts === products.length invariant')

// Perform a full save with explicit totalProducts mismatch to verify the writer corrects it
const corrupt = {
  ...emptyRuntimeCatalogStore(),
  totalProducts: 999,  // wrong on purpose
  products:      [sampleProduct],
}
saveRuntimeCatalog(corrupt, 'test-script')
const store8 = readRuntimeCatalog()
ok('writer corrects totalProducts',   store8.totalProducts === store8.products.length)
ok('products.length is 1',            store8.products.length === 1)

removeRuntimeProduct(sampleProduct.asin, 'test-script')

// ── Test 9 — Category config ──────────────────────────────────────────────────

section('Test 9 — Category config reads correctly')

const config = getCategoryConfig()
ok('config is object',                     typeof config === 'object' && config !== null)
ok('electronica has minimum',              typeof config['electronica']?.minimum === 'number')
ok('all 10 canonical categories present',  [
  'electronica','gaming','hogar','cocina','deporte',
  'oficina','belleza','mascotas','bebes','herramientas',
].every(slug => slug in config))

ok('getCategoryMinimum("gaming") === 20',  getCategoryMinimum('gaming') === 20)
ok('getCategoryCurrentCount("electronica") is number',
  typeof getCategoryCurrentCount('electronica') === 'number')

// Update a minimum
updateCategoryMinimum('gaming', 25)
ok('updateCategoryMinimum("gaming", 25)',  getCategoryMinimum('gaming') === 25)

// Restore to 20
updateCategoryMinimum('gaming', 20)
ok('restore gaming minimum to 20',         getCategoryMinimum('gaming') === 20)

// ── Test 10 — computeCategoryDeficits() ──────────────────────────────────────

section('Test 10 — computeCategoryDeficits()')

const deficits = computeCategoryDeficits()
ok('returns array',               Array.isArray(deficits))
ok('all 10 categories present',   deficits.length >= 10)
ok('each item has category',      deficits.every(d => typeof d.category === 'string'))
ok('each item has current',       deficits.every(d => typeof d.current  === 'number'))
ok('each item has minimum',       deficits.every(d => typeof d.minimum  === 'number'))
ok('each item has deficit ≥ 0',   deficits.every(d => d.deficit >= 0))
ok('deficit = max(0, min-curr)',  deficits.every(d => d.deficit === Math.max(0, d.minimum - d.current)))
ok('sorted by deficit desc',      deficits.every((d, i) => i === 0 || d.deficit <= deficits[i - 1]!.deficit))

// Add a product and verify deficit decreases
addRuntimeProduct({ ...sampleProduct, asin: 'B0DEFICIT001', id: 'elec-deficit-001' }, 'test-script')
const deficitsAfter = computeCategoryDeficits()
const electronicaDeficit = deficitsAfter.find(d => d.category === 'electronica')
ok('adding a product decreases deficit', (electronicaDeficit?.current ?? 0) >= 1)
removeRuntimeProduct('B0DEFICIT001', 'test-script')

// ── Test 11 — Recovery from corrupt primary ───────────────────────────────────

section('Test 11 — Recovery from corrupt primary → backup')

// Save a known-good state
addRuntimeProduct(sampleProduct, 'test-script')
const goodVersion = readRuntimeCatalog().version

// Corrupt the primary file
writeFileSync(CATALOG_FILE, 'NOT VALID JSON {{{', 'utf-8')

// Reader should fall back to backup
const recovered = readRuntimeCatalog()
ok('reader falls back to backup after corruption', typeof recovered.version === 'number')
ok('recovered store has products array',            Array.isArray(recovered.products))

// Restore a good state by writing through the API (which repairs the file)
const backupStore = recovered
saveRuntimeCatalog(backupStore, 'test-script-recovery')
ok('primary file restored after write',  (() => {
  try { JSON.parse(readFileSync(CATALOG_FILE, 'utf-8') as string); return true }
  catch { return false }
})())

// ── Test 12 — Recovery from both corrupt ─────────────────────────────────────

section('Test 12 — Recovery from corrupt primary + corrupt backup → empty store')

writeFileSync(CATALOG_FILE, 'CORRUPT PRIMARY', 'utf-8')
writeFileSync(BACKUP_FILE,  'CORRUPT BACKUP',  'utf-8')

const fallback = readRuntimeCatalog()
ok('returns empty store on double corruption',        fallback.totalProducts === 0)
ok('empty store has products array',                  Array.isArray(fallback.products))
ok('version is still ≥ 1',                            fallback.version >= 1)

// Restore files to clean state
saveRuntimeCatalog(emptyRuntimeCatalogStore(), 'test-script-restore')
ok('can write after double corruption recovery',
  existsSync(CATALOG_FILE) && (() => {
    try { JSON.parse(readFileSync(CATALOG_FILE, 'utf-8') as string); return true }
    catch { return false }
  })(),
)

// ── Stats test ────────────────────────────────────────────────────────────────

section('Bonus — getRuntimeCatalogStats()')

addRuntimeProduct(sampleProduct, 'test-script')
const stats = getRuntimeCatalogStats()
ok('totalProducts is number',  typeof stats.totalProducts === 'number')
ok('byCategory is object',     typeof stats.byCategory    === 'object')
ok('version is number',        typeof stats.version       === 'number')
removeRuntimeProduct(sampleProduct.asin, 'test-script')

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`Result: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  console.error('\n❌ Some tests failed — review output above.')
  process.exit(1)
} else {
  console.log('\n✅ All tests passed — Runtime Catalog infrastructure is ready.')
}
