/**
 * scripts/validate-data-integrity.ts
 *
 * Sprint 5C — Data Integrity Engine.
 *
 * Validates all OPS V3 stores for structural integrity and cross-reference
 * consistency. Safe to run at any time — read-only, never writes to stores.
 *
 * Run: npx tsx --tsconfig tsconfig.scripts.json scripts/validate-data-integrity.ts
 */

import { existsSync, readFileSync } from 'fs'
import path from 'path'

const ROOT       = process.cwd()
const CATEGORIES = [
  'electronica', 'gaming', 'hogar', 'cocina', 'oficina',
  'deporte', 'mascotas', 'belleza', 'bebes', 'herramientas',
]

// ── Harness ───────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const warnings:        string[] = []
const orphanAsins:     string[] = []
const duplicateAsins:  string[] = []
const invalidProducts: string[] = []

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ❌ ${name}`)
    console.error(`     ${err instanceof Error ? err.message : String(err)}`)
    failed++
  }
}

function warn(msg: string): void {
  warnings.push(msg)
  console.warn(`  ⚠️  ${msg}`)
}

function section(title: string): void {
  console.log(`\n${title}`)
}

// ── Safe JSON reader ──────────────────────────────────────────────────────────

function safeRead(relPath: string): unknown | null {
  const fullPath = path.join(ROOT, relPath)
  if (!existsSync(fullPath)) return null
  try {
    return JSON.parse(readFileSync(fullPath, 'utf-8'))
  } catch {
    return null
  }
}

// ── Section 1: All readers degrade elegantly ─────────────────────────────────

section('1. Store readers — fault tolerance (safeRead never throws)')

const ALL_STORES = [
  'data/catalog/runtime-catalog.json',
  'data/catalog/runtime-catalog.backup.json',
  'data/catalog/lifecycle.json',
  'data/catalog/price-history.json',
  'data/catalog/product-intelligence.json',
  'data/catalog/recommendations.json',
  'data/catalog/alerts.json',
  'data/catalog/discovery-state.json',
  'data/catalog/catalog-execution.json',
  'data/ops/runtime/automation-state.json',
  'data/ops/runtime/maintenance-state.json',
  'data/ops/runtime/master-cycle-state.json',
]

for (const store of ALL_STORES) {
  test(`safeRead("${store.split('/').pop()}") never throws`, () => {
    safeRead(store) // returns null if missing or corrupt — never throws
  })
}

// ── Section 2: Runtime catalog structural integrity ───────────────────────────

section('2. Runtime catalog — structural integrity')

const rawCatalog = safeRead('data/catalog/runtime-catalog.json')
const catalog    = rawCatalog as Record<string, unknown> | null

test('runtime-catalog.json is parseable', () => {
  if (catalog === null) throw new Error('file missing or corrupt')
})

let products: Record<string, unknown>[] = []

if (catalog) {
  test('products field is an array', () => {
    if (!Array.isArray(catalog['products']))
      throw new Error('products is not an array')
    products = catalog['products'] as Record<string, unknown>[]
  })

  if (Array.isArray(catalog['products'])) {
    products = catalog['products'] as Record<string, unknown>[]

    test('totalProducts === products.length', () => {
      const total = typeof catalog['totalProducts'] === 'number'
        ? catalog['totalProducts']
        : -1
      if (total !== products.length)
        throw new Error(`totalProducts=${total} but products.length=${products.length}`)
    })

    test('all ASINs are unique (no duplicates)', () => {
      const seen = new Set<string>()
      for (const p of products) {
        const asin = p['asin'] as string
        if (!asin) continue
        if (seen.has(asin)) {
          duplicateAsins.push(asin)
          throw new Error(`duplicate ASIN: ${asin}`)
        }
        seen.add(asin)
      }
    })

    test('all IDs are unique (no duplicates)', () => {
      const seen = new Set<string>()
      for (const p of products) {
        const id = p['id'] as string
        if (!id) continue
        if (seen.has(id)) throw new Error(`duplicate ID: ${id}`)
        seen.add(id)
      }
    })

    test('all statuses are valid enum values', () => {
      const VALID = new Set(['active', 'inactive', 'unverified', 'stale'])
      for (const p of products) {
        const status = p['status']
        if (status !== undefined && !VALID.has(status as string)) {
          invalidProducts.push(p['asin'] as string)
          throw new Error(`invalid status "${status}" on ASIN ${p['asin']}`)
        }
      }
    })

    test('all categories are known slugs', () => {
      const catSet  = new Set(CATEGORIES)
      const unknown: string[] = []
      for (const p of products) {
        const cat = p['category'] as string
        if (!catSet.has(cat)) unknown.push(`${p['asin']}:${cat}`)
      }
      if (unknown.length > 0) warn(`unknown categories: ${unknown.join(', ')}`)
    })

    test('all prices are non-negative numbers', () => {
      for (const p of products) {
        const price = p['price']
        if (typeof price !== 'number' || price < 0)
          throw new Error(`invalid price ${price} on ASIN ${p['asin']}`)
      }
    })

    test('all ratings are in [0, 5]', () => {
      for (const p of products) {
        const rating = p['rating']
        if (typeof rating !== 'number' || rating < 0 || rating > 5)
          throw new Error(`invalid rating ${rating} on ASIN ${p['asin']}`)
      }
    })

    test('all review counts are non-negative integers', () => {
      for (const p of products) {
        const reviews = p['reviews']
        if (typeof reviews !== 'number' || reviews < 0)
          throw new Error(`invalid reviews ${reviews} on ASIN ${p['asin']}`)
      }
    })
  }
}

// ── Section 3: Cross-reference integrity ──────────────────────────────────────

section('3. Cross-reference integrity')

const runtimeAsins = new Set(
  products.map(p => p['asin'] as string).filter(Boolean)
)

function checkCrossRef(
  storeName:  string,
  relPath:    string,
  getAsins:   (raw: unknown) => string[],
): void {
  test(`${storeName} — all ASINs exist in runtime catalog`, () => {
    const raw = safeRead(relPath)
    if (raw === null) {
      warn(`${storeName} not found — skipping cross-reference check`)
      return
    }
    const storeAsins = getAsins(raw)
    const orphans    = storeAsins.filter(a => a && !runtimeAsins.has(a))
    if (orphans.length > 0) {
      orphanAsins.push(...orphans)
      warn(`${storeName}: ${orphans.length} orphan ASINs not in runtime catalog: ${orphans.slice(0, 3).join(', ')}${orphans.length > 3 ? '...' : ''}`)
    }
  })
}

checkCrossRef(
  'lifecycle',
  'data/catalog/lifecycle.json',
  raw => {
    const r    = raw as Record<string, unknown>
    const prods = r['products'] as Record<string, unknown> | undefined
    return prods ? Object.keys(prods) : []
  },
)

checkCrossRef(
  'recommendations',
  'data/catalog/recommendations.json',
  raw => {
    const r     = raw as Record<string, unknown>
    const prods = r['products'] as Record<string, unknown> | undefined
    if (!prods) return []
    return Object.values(prods)
      .map((v: unknown) => (v as Record<string, unknown>)['asin'] as string)
      .filter(Boolean)
  },
)

checkCrossRef(
  'alerts',
  'data/catalog/alerts.json',
  raw => {
    const r      = raw as Record<string, unknown>
    const alerts = r['alerts'] as Record<string, unknown> | undefined
    if (!alerts) return []
    return Object.values(alerts)
      .map((v: unknown) => (v as Record<string, unknown>)['asin'] as string)
      .filter(Boolean)
  },
)

checkCrossRef(
  'product-intelligence',
  'data/catalog/product-intelligence.json',
  raw => {
    const r     = raw as Record<string, unknown>
    const prods = r['products'] as Record<string, unknown> | undefined
    return prods ? Object.keys(prods) : []
  },
)

checkCrossRef(
  'price-history',
  'data/catalog/price-history.json',
  raw => {
    const r     = raw as Record<string, unknown>
    const prods = r['products'] as Record<string, unknown> | undefined
    return prods ? Object.keys(prods) : []
  },
)

// ── Section 4: OPS runtime state ──────────────────────────────────────────────

section('4. OPS runtime state — schema checks')

test('master-cycle-state.json has isRunning field', () => {
  const raw = safeRead('data/ops/runtime/master-cycle-state.json')
  if (raw === null) { warn('master-cycle-state.json not found — skipping'); return }
  const r = raw as Record<string, unknown>
  if (!('isRunning' in r)) throw new Error('missing isRunning field')
  if (typeof r['isRunning'] !== 'boolean') throw new Error('isRunning must be boolean')
})

test('master-cycle-state.json isRunning=false when server is idle', () => {
  const raw = safeRead('data/ops/runtime/master-cycle-state.json')
  if (raw === null) { warn('master-cycle-state.json not found — skipping'); return }
  const r = raw as Record<string, unknown>
  if (r['isRunning'] === true) {
    throw new Error('isRunning=true — either a cycle is running or a stale lock from a crash')
  }
})

test('catalog-execution.json isRunning=false when server is idle', () => {
  const raw = safeRead('data/catalog/catalog-execution.json')
  if (raw === null) { warn('catalog-execution.json not found — skipping'); return }
  const r = raw as Record<string, unknown>
  if (r['isRunning'] === true) {
    throw new Error('isRunning=true — either a fill is running or a stale lock from a crash')
  }
})

// ── Results ───────────────────────────────────────────────────────────────────

console.log()
console.log(`Results: ${passed} passed, ${failed} failed, ${warnings.length} warnings`)
console.log()

const report = { passed, failed, warnings, orphanAsins, duplicateAsins, invalidProducts }
console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
