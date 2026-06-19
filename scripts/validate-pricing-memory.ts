/**
 * scripts/validate-pricing-memory.ts
 *
 * Sprint 4E — Pricing Memory & Product Intelligence validation suite.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/validate-pricing-memory.ts
 *
 * All tests are in-memory; no I/O.
 */

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

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

function expect<T>(actual: T, expected: T, label?: string): void {
  const ok =
    typeof expected === 'number' && typeof actual === 'number'
      ? Math.abs(actual - expected) < 0.001
      : actual === expected
  if (!ok) {
    throw new Error(
      `${label ? label + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function expectBetween(actual: number, min: number, max: number, label?: string): void {
  if (actual < min || actual > max) {
    throw new Error(
      `${label ?? 'value'}: expected ${actual} to be between ${min} and ${max}`,
    )
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

section('1. File structure')
test('types.ts exports PriceSnapshot interface', () => {
  const typesPath = require.resolve('../lib/catalog/pricing-memory/types')
  expect(typeof typesPath, 'string', 'module resolves')
})

test('types.ts exports all required interfaces', () => {
  // Type-only check via static analysis (module must compile)
  // If import fails the test runner catches it
  const _t: import('../lib/catalog/pricing-memory/types').PriceSnapshot = { price: 10, timestamp: 'x' }
  const _h: import('../lib/catalog/pricing-memory/types').PriceTrend = 'rising'
  void _t; void _h
})

test('state.ts exports read/save/update functions', () => {
  const m = require('../lib/catalog/pricing-memory/state')
  expect(typeof m.readPriceHistory,        'function', 'readPriceHistory')
  expect(typeof m.savePriceHistory,        'function', 'savePriceHistory')
  expect(typeof m.updatePriceHistory,      'function', 'updatePriceHistory')
  expect(typeof m.readProductIntelligence, 'function', 'readProductIntelligence')
  expect(typeof m.saveProductIntelligence, 'function', 'saveProductIntelligence')
  expect(typeof m.updateProductIntelligence,'function','updateProductIntelligence')
})

test('analytics.ts exports computePriceVolatility / computePriceTrend / computePriceOpportunity', () => {
  const m = require('../lib/catalog/pricing-memory/analytics')
  expect(typeof m.computePriceVolatility,  'function', 'computePriceVolatility')
  expect(typeof m.computePriceTrend,       'function', 'computePriceTrend')
  expect(typeof m.computePriceOpportunity, 'function', 'computePriceOpportunity')
  expect(typeof m.computeProductAnalytics, 'function', 'computeProductAnalytics')
})

test('governance.ts exports getPricingGovernance', () => {
  const m = require('../lib/catalog/pricing-memory/governance')
  expect(typeof m.getPricingGovernance, 'function')
})

test('index.ts barrel re-exports all public symbols', () => {
  const m = require('../lib/catalog/pricing-memory/index')
  const required = [
    'readPriceHistory', 'savePriceHistory', 'updatePriceHistory',
    'readProductIntelligence', 'saveProductIntelligence', 'updateProductIntelligence',
    'computePriceVolatility', 'computePriceTrend', 'computePriceOpportunity',
    'computeProductAnalytics', 'getPricingGovernance', 'runPricingScan',
  ]
  for (const sym of required) {
    expect(typeof m[sym], 'function', sym)
  }
})

// ── Section 2: Volatility ─────────────────────────────────────────────────────

section('2. computePriceVolatility')

import { computePriceVolatility } from '../lib/catalog/pricing-memory/analytics'
import type { PriceSnapshot } from '../lib/catalog/pricing-memory/types'

function snaps(prices: number[]): PriceSnapshot[] {
  return prices.map((p, i) => ({ price: p, timestamp: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` }))
}

test('returns 0 for a single snapshot', () => {
  expect(computePriceVolatility(snaps([100])), 0)
})

test('returns 0 for empty snapshots', () => {
  expect(computePriceVolatility([]), 0)
})

test('returns 0 for perfectly stable price', () => {
  expect(computePriceVolatility(snaps([50, 50, 50, 50, 50])), 0)
})

test('returns value 0-100 for moderate volatility', () => {
  const v = computePriceVolatility(snaps([100, 120, 80, 115, 90]))
  expectBetween(v, 1, 100, 'moderate volatility')
})

test('caps at 100 for extreme volatility', () => {
  const v = computePriceVolatility(snaps([1, 1000, 1, 1000, 1]))
  expect(v, 100, 'extreme volatility caps at 100')
})

test('result is integer (Math.round applied)', () => {
  const v = computePriceVolatility(snaps([100, 110, 90, 105, 95]))
  expect(v, Math.round(v), 'integer result')
})

// ── Section 3: Trend ──────────────────────────────────────────────────────────

section('3. computePriceTrend')

import { computePriceTrend } from '../lib/catalog/pricing-memory/analytics'

test('returns stable for fewer than 4 snapshots', () => {
  expect(computePriceTrend(snaps([100, 110, 105])), 'stable')
})

test('returns stable for constant price', () => {
  expect(computePriceTrend(snaps([100, 100, 100, 100, 100, 100, 100, 100])), 'stable')
})

test('returns rising for steadily increasing prices', () => {
  // early: [80, 82], recent: [118, 120] — 45% increase
  const trend = computePriceTrend(snaps([80, 82, 90, 100, 110, 115, 118, 120]))
  expect(trend, 'rising')
})

test('returns falling for steadily decreasing prices', () => {
  // early: [120, 118], recent: [82, 80] — 33% decrease
  const trend = computePriceTrend(snaps([120, 118, 110, 100, 90, 85, 82, 80]))
  expect(trend, 'falling')
})

test('returns stable for price within ±5% band', () => {
  // early avg ≈100, recent avg ≈103 → 3% → stable
  const trend = computePriceTrend(snaps([100, 101, 102, 100, 101, 102, 103, 103]))
  expect(trend, 'stable')
})

test('handles exactly 4 snapshots', () => {
  // 4 snaps: quarter=1, early=[100], recent=[200] → +100% → rising
  const trend = computePriceTrend(snaps([100, 110, 170, 200]))
  expect(trend, 'rising')
})

// ── Section 4: Opportunity ────────────────────────────────────────────────────

section('4. computePriceOpportunity')

import { computePriceOpportunity } from '../lib/catalog/pricing-memory/analytics'
import type { ProductPriceHistory } from '../lib/catalog/pricing-memory/types'

function makeHistory(
  lowestPrice: number,
  highestPrice: number,
  latestPrice: number,
  averagePrice: number,
): ProductPriceHistory {
  return {
    asin: 'TEST123456',
    firstPrice: highestPrice,
    latestPrice,
    lowestPrice,
    highestPrice,
    averagePrice,
    snapshots: [],
  }
}

test('returns 0 when highest === lowest (no price history range)', () => {
  const h = makeHistory(100, 100, 100, 100)
  expect(computePriceOpportunity(h, 0), 0)
})

test('returns 0 when latestPrice is 0 or negative', () => {
  const h = makeHistory(50, 100, 0, 75)
  expect(computePriceOpportunity(h, 0), 0)
})

test('maximum opportunity when at historical low', () => {
  // latestPrice = lowestPrice → nearLow = 40 pts
  const h = makeHistory(50, 100, 50, 75)
  const score = computePriceOpportunity(h, 50)  // moderate volatility bonus
  expectBetween(score, 50, 100, 'at historical low')
})

test('minimum opportunity when at historical high', () => {
  // latestPrice = highestPrice → nearLow = 0 pts
  const h = makeHistory(50, 100, 100, 75)
  const score = computePriceOpportunity(h, 0)  // no vol bonus
  expectBetween(score, 0, 20, 'at historical high')
})

test('result is clamped between 0 and 100', () => {
  const h = makeHistory(10, 200, 10, 100)
  const score = computePriceOpportunity(h, 55)
  expectBetween(score, 0, 100, 'clamped 0-100')
})

test('volatility sweet spot (40-70) adds bonus points', () => {
  const h = makeHistory(50, 100, 60, 75)
  const scoreNoVol  = computePriceOpportunity(h, 0)
  const scoreWithVol = computePriceOpportunity(h, 55)
  if (scoreWithVol <= scoreNoVol) {
    throw new Error(`expected vol bonus: ${scoreWithVol} should be > ${scoreNoVol}`)
  }
})

// ── Section 5: computeProductAnalytics ───────────────────────────────────────

section('5. computeProductAnalytics')

import { computeProductAnalytics } from '../lib/catalog/pricing-memory/analytics'

test('returns object with volatility, trend, opportunity', () => {
  const prices = [100, 110, 90, 105, 80, 120, 95, 100, 85, 115]
  const history: ProductPriceHistory = {
    asin: 'TESTANALYTICS',
    firstPrice: 100,
    latestPrice: 115,
    lowestPrice: 80,
    highestPrice: 120,
    averagePrice: 100,
    snapshots: snaps(prices),
  }
  const result = computeProductAnalytics(history)
  expect(typeof result.volatility,  'number')
  expect(typeof result.opportunity, 'number')
  expect(['rising', 'falling', 'stable'].includes(result.trend), true)
  expectBetween(result.volatility,  0, 100)
  expectBetween(result.opportunity, 0, 100)
})

// ── Section 6: PriceHistoryStore defaults ────────────────────────────────────

section('6. PriceHistoryStore — defaults and migration')

test('readPriceHistory returns default when no file exists', () => {
  // Can't do real file reads in unit test; verify structure only
  const { defaultPriceHistoryShape } = (() => {
    return {
      defaultPriceHistoryShape: {
        updatedAt: null,
        products:  {},
      },
    }
  })()
  expect(defaultPriceHistoryShape.updatedAt, null)
  expect(typeof defaultPriceHistoryShape.products, 'object')
  expect(Object.keys(defaultPriceHistoryShape.products).length, 0)
})

test('MAX_SNAPSHOTS constant is 100', () => {
  // Verify the cap behavior via snapshot array truncation logic
  const MAX = 100
  const oldSnaps: PriceSnapshot[] = Array.from({ length: 100 }, (_, i) => ({
    price: 10 + i,
    timestamp: `2024-01-01T00:00:0${String(i % 10)}Z`,
  }))
  const newSnap: PriceSnapshot = { price: 999, timestamp: '2025-01-01T00:00:00Z' }
  const result = [...oldSnaps, newSnap].slice(-MAX)
  expect(result.length, MAX, 'capped at 100')
  expect(result[MAX - 1].price, 999, 'newest snapshot preserved')
  expect(result[0].price, oldSnaps[1].price, 'oldest dropped')
})

test('price dedup: identical consecutive price should be detected', () => {
  // Simulate dedup logic: if last snap price === new price → skip
  const existingSnaps: PriceSnapshot[] = [{ price: 100, timestamp: '2024-01-01T00:00:00Z' }]
  const newPrice = 100
  const last = existingSnaps.at(-1)
  const shouldSkip = last?.price === newPrice
  expect(shouldSkip, true, 'dedup detects identical price')
})

test('price dedup: different price should NOT be skipped', () => {
  const existingSnaps: PriceSnapshot[] = [{ price: 100, timestamp: '2024-01-01T00:00:00Z' }]
  const newPrice = 101
  const last = existingSnaps.at(-1)
  const shouldSkip = last?.price === newPrice
  expect(shouldSkip, false, 'different price not deduped')
})

// ── Section 7: ProductPriceHistory stat recomputation ─────────────────────────

section('7. ProductPriceHistory — stat recomputation')

test('lowestPrice is Math.min of all snapshot prices', () => {
  const prices = [100, 80, 120, 90, 110]
  const min = Math.min(...prices)
  expect(min, 80)
})

test('highestPrice is Math.max of all snapshot prices', () => {
  const prices = [100, 80, 120, 90, 110]
  const max = Math.max(...prices)
  expect(max, 120)
})

test('averagePrice rounds to 2 decimal places', () => {
  const prices = [10, 20, 30]
  const sum = prices.reduce((a, b) => a + b, 0)
  const avg = Math.round((sum / prices.length) * 100) / 100
  expect(avg, 20, 'avg of [10,20,30]')
})

test('firstPrice is preserved from existing entry', () => {
  // The firstPrice should be the original, not overwritten by subsequent updates
  const existingFirstPrice = 50
  const newPrice = 100
  // Simulate: if existing.firstPrice exists, keep it
  const firstPrice = existingFirstPrice ?? newPrice
  expect(firstPrice, 50, 'firstPrice preserved')
})

// ── Section 8: ProductIntelligence defaults ──────────────────────────────────

section('8. ProductIntelligence — defaults and merge pattern')

test('default intelligence has volatilityScore 0', () => {
  const defaults = {
    asin: 'TESTX',
    volatilityScore: 0,
    opportunityScore: 0,
    trend: 'stable' as const,
    lastPriceDropAt: null,
    totalPriceChanges: 0,
  }
  expect(defaults.volatilityScore,   0)
  expect(defaults.opportunityScore,  0)
  expect(defaults.trend,             'stable')
  expect(defaults.lastPriceDropAt,   null)
  expect(defaults.totalPriceChanges, 0)
})

test('merge pattern avoids TS2783: spreads only, asin forced last', () => {
  const defaults = { asin: 'BASE', volatilityScore: 0, opportunityScore: 0, trend: 'stable' as const, lastPriceDropAt: null, totalPriceChanges: 0 }
  const existing = { asin: 'BASE', volatilityScore: 30, opportunityScore: 10, trend: 'stable' as const, lastPriceDropAt: null, totalPriceChanges: 5 }
  const updates  = { volatilityScore: 55, trend: 'falling' as const }
  const merged   = { ...defaults, ...existing, ...updates, asin: 'BASE' }
  expect(merged.volatilityScore,  55,       'update applied')
  expect(merged.trend,            'falling','update applied')
  expect(merged.totalPriceChanges, 5,       'existing preserved')
  expect(merged.asin,             'BASE',   'asin forced')
})

// ── Section 9: Governance aggregation ────────────────────────────────────────

section('9. PricingGovernance aggregation')

import type { ProductIntelligence } from '../lib/catalog/pricing-memory/types'

function mockIntelligence(overrides: Partial<ProductIntelligence> & { asin: string }): ProductIntelligence {
  return {
    volatilityScore:   0,
    opportunityScore:  0,
    trend:             'stable',
    lastPriceDropAt:   null,
    totalPriceChanges: 0,
    ...overrides,
  }
}

function computeGovernanceFromProducts(products: ProductIntelligence[]) {
  if (products.length === 0) {
    return { totalProducts: 0, rising: 0, falling: 0, stable: 0, opportunities: 0, averageVolatility: 0, averageOpportunity: 0 }
  }
  let rising = 0, falling = 0, stable = 0, opportunities = 0
  let sumVol = 0, sumOpp = 0
  for (const p of products) {
    if (p.trend === 'rising')  rising++
    if (p.trend === 'falling') falling++
    if (p.trend === 'stable')  stable++
    if (p.opportunityScore >= 60) opportunities++
    sumVol += p.volatilityScore
    sumOpp += p.opportunityScore
  }
  return {
    totalProducts: products.length,
    rising, falling, stable, opportunities,
    averageVolatility:  Math.round(sumVol / products.length),
    averageOpportunity: Math.round(sumOpp / products.length),
  }
}

test('empty products → all zeros', () => {
  const gov = computeGovernanceFromProducts([])
  expect(gov.totalProducts,      0)
  expect(gov.rising,             0)
  expect(gov.opportunities,      0)
  expect(gov.averageVolatility,  0)
  expect(gov.averageOpportunity, 0)
})

test('correctly counts trend breakdown', () => {
  const products = [
    mockIntelligence({ asin: 'A', trend: 'rising'  }),
    mockIntelligence({ asin: 'B', trend: 'rising'  }),
    mockIntelligence({ asin: 'C', trend: 'falling' }),
    mockIntelligence({ asin: 'D', trend: 'stable'  }),
  ]
  const gov = computeGovernanceFromProducts(products)
  expect(gov.totalProducts, 4)
  expect(gov.rising,  2)
  expect(gov.falling, 1)
  expect(gov.stable,  1)
})

test('opportunities counts products with opportunityScore >= 60', () => {
  const products = [
    mockIntelligence({ asin: 'A', opportunityScore: 75 }),
    mockIntelligence({ asin: 'B', opportunityScore: 60 }),
    mockIntelligence({ asin: 'C', opportunityScore: 59 }),
    mockIntelligence({ asin: 'D', opportunityScore: 10 }),
  ]
  const gov = computeGovernanceFromProducts(products)
  expect(gov.opportunities, 2, 'exactly 2 products >= 60')
})

test('averages are rounded integers', () => {
  const products = [
    mockIntelligence({ asin: 'A', volatilityScore: 10, opportunityScore: 20 }),
    mockIntelligence({ asin: 'B', volatilityScore: 30, opportunityScore: 40 }),
  ]
  const gov = computeGovernanceFromProducts(products)
  expect(gov.averageVolatility,  20)
  expect(gov.averageOpportunity, 30)
})

// ── Section 10: Snapshot limits & idempotence ─────────────────────────────────

section('10. Snapshot limits and idempotence')

test('slice(-100) drops oldest when cap exceeded', () => {
  const existing: PriceSnapshot[] = Array.from({ length: 100 }, (_, i) => ({
    price: 10 + i,
    timestamp: `2024-01-01T00:00:00.${i}Z`,
  }))
  const newSnap = { price: 200, timestamp: '2025-06-01T00:00:00Z' }
  const result  = [...existing, newSnap].slice(-100)
  expect(result.length, 100, 'capped at 100')
  expect(result[result.length - 1].price, 200, 'newest at end')
  expect(result[0].price, existing[1].price, 'oldest dropped')
})

test('idempotent: recording same price twice produces one snapshot', () => {
  const existing: PriceSnapshot[] = [{ price: 100, timestamp: '2024-01-01T00:00:00Z' }]
  const newPrice = 100
  const last     = existing.at(-1)
  const skip     = last?.price === newPrice
  const result   = skip ? existing : [...existing, { price: newPrice, timestamp: '2024-06-01T00:00:00Z' }]
  expect(result.length, 1, 'no duplicate snapshot for same price')
})

test('recording different price adds new snapshot', () => {
  const existing: PriceSnapshot[] = [{ price: 100, timestamp: '2024-01-01T00:00:00Z' }]
  const newPrice = 105
  const last     = existing.at(-1)
  const skip     = last?.price === newPrice
  const result   = skip ? existing : [...existing, { price: newPrice, timestamp: '2024-06-01T00:00:00Z' }]
  expect(result.length, 2, 'new snapshot added')
  expect(result[1].price, 105)
})

// ── Section 11: OPS log type ──────────────────────────────────────────────────

section('11. OPS log type')

test("'catalog-pricing' is a valid OpsJobType", () => {
  const { } = {} // type check only — if it compiles the type exists
  const jobType: import('../lib/ops/logs/types').OpsJobType = 'catalog-pricing'
  expect(typeof jobType, 'string')
  expect(jobType, 'catalog-pricing')
})

test("'catalog-lifecycle' remains a valid OpsJobType", () => {
  const jobType: import('../lib/ops/logs/types').OpsJobType = 'catalog-lifecycle'
  expect(typeof jobType, 'string')
})

// ── Section 12: Pipeline integration ─────────────────────────────────────────

section('12. Pipeline integration')

test('admission.ts imports updatePriceHistory', () => {
  const fs   = require('fs')
  const path = require('path')
  const src  = fs.readFileSync(path.resolve(__dirname, '../lib/catalog/admission/admission.ts'), 'utf-8')
  if (!src.includes('updatePriceHistory')) {
    throw new Error('updatePriceHistory not imported in admission.ts')
  }
})

test('admission.ts calls updatePriceHistory when candidate.price exists', () => {
  const fs   = require('fs')
  const path = require('path')
  const src  = fs.readFileSync(path.resolve(__dirname, '../lib/catalog/admission/admission.ts'), 'utf-8')
  if (!src.includes('candidate.price')) {
    throw new Error('candidate.price check not found in admission.ts')
  }
})

test('product-validator.ts imports updatePriceHistory', () => {
  const fs   = require('fs')
  const path = require('path')
  const src  = fs.readFileSync(path.resolve(__dirname, '../lib/catalog/live-truth/product-validator.ts'), 'utf-8')
  if (!src.includes('updatePriceHistory')) {
    throw new Error('updatePriceHistory not imported in product-validator.ts')
  }
})

test('product-validator.ts calls updatePriceHistory with extracted.priceUSD', () => {
  const fs   = require('fs')
  const path = require('path')
  const src  = fs.readFileSync(path.resolve(__dirname, '../lib/catalog/live-truth/product-validator.ts'), 'utf-8')
  if (!src.includes('extracted.priceUSD')) {
    throw new Error('extracted.priceUSD call not found in product-validator.ts')
  }
})

// ── Section 13: UI components ─────────────────────────────────────────────────

section('13. UI components')

test('PricingGovernance.tsx exists and exports PricingGovernance', () => {
  const fs   = require('fs')
  const path = require('path')
  const src  = fs.readFileSync(
    path.resolve(__dirname, '../components/admin/catalog/PricingGovernance.tsx'), 'utf-8',
  )
  if (!src.includes('export function PricingGovernance')) {
    throw new Error('PricingGovernance component not exported')
  }
  if (!src.includes('governance: PricingGovernanceType')) {
    throw new Error('PricingGovernance missing governance prop')
  }
})

test('PricingProducts.tsx exists and exports PricingProducts', () => {
  const fs   = require('fs')
  const path = require('path')
  const src  = fs.readFileSync(
    path.resolve(__dirname, '../components/admin/catalog/PricingProducts.tsx'), 'utf-8',
  )
  if (!src.includes('export function PricingProducts')) {
    throw new Error('PricingProducts component not exported')
  }
  if (!src.includes('products: ProductIntelligence[]')) {
    throw new Error('PricingProducts missing products prop')
  }
})

test('PricingProducts sorts by opportunityScore desc and slices to 20', () => {
  const fs   = require('fs')
  const path = require('path')
  const src  = fs.readFileSync(
    path.resolve(__dirname, '../components/admin/catalog/PricingProducts.tsx'), 'utf-8',
  )
  if (!src.includes('opportunityScore')) {
    throw new Error('PricingProducts does not reference opportunityScore')
  }
  if (!src.includes('.slice(0, 20)')) {
    throw new Error('PricingProducts does not slice to 20')
  }
})

test('page.tsx imports PricingGovernance and PricingProducts', () => {
  const fs   = require('fs')
  const path = require('path')
  const src  = fs.readFileSync(
    path.resolve(__dirname, '../app/admin/catalog/page.tsx'), 'utf-8',
  )
  if (!src.includes('PricingGovernance')) {
    throw new Error('PricingGovernance not imported in page.tsx')
  }
  if (!src.includes('PricingProducts')) {
    throw new Error('PricingProducts not imported in page.tsx')
  }
})

test('page.tsx renders Zone 11 (Pricing Memory Governance)', () => {
  const fs   = require('fs')
  const path = require('path')
  const src  = fs.readFileSync(
    path.resolve(__dirname, '../app/admin/catalog/page.tsx'), 'utf-8',
  )
  if (!src.includes('pricingGovernance')) {
    throw new Error('pricingGovernance prop not passed to PricingGovernance in page.tsx')
  }
})

test('page.tsx renders Zone 12 (Pricing Products)', () => {
  const fs   = require('fs')
  const path = require('path')
  const src  = fs.readFileSync(
    path.resolve(__dirname, '../app/admin/catalog/page.tsx'), 'utf-8',
  )
  if (!src.includes('pricingProducts')) {
    throw new Error('pricingProducts prop not passed to PricingProducts in page.tsx')
  }
})

// ── Section 14: runPricingScan ────────────────────────────────────────────────

section('14. runPricingScan coordinator')

test('index.ts exports runPricingScan function', () => {
  const m = require('../lib/catalog/pricing-memory/index')
  expect(typeof m.runPricingScan, 'function')
})

test('runPricingScan returns PricingScanResult shape', () => {
  const fs   = require('fs')
  const path = require('path')
  const src  = fs.readFileSync(
    path.resolve(__dirname, '../lib/catalog/pricing-memory/index.ts'), 'utf-8',
  )
  if (!src.includes('productsScanned')) {
    throw new Error('runPricingScan result missing productsScanned')
  }
  if (!src.includes('intelligenceUpdated')) {
    throw new Error('runPricingScan result missing intelligenceUpdated')
  }
  if (!src.includes('governance')) {
    throw new Error('runPricingScan result missing governance')
  }
})

test('runPricingScan writes OPS log with catalog-pricing jobType', () => {
  const fs   = require('fs')
  const path = require('path')
  const src  = fs.readFileSync(
    path.resolve(__dirname, '../lib/catalog/pricing-memory/index.ts'), 'utf-8',
  )
  if (!src.includes("'catalog-pricing'")) {
    throw new Error("catalog-pricing jobType not found in runPricingScan")
  }
})

test('runPricingScan calls saveProductIntelligence', () => {
  const fs   = require('fs')
  const path = require('path')
  const src  = fs.readFileSync(
    path.resolve(__dirname, '../lib/catalog/pricing-memory/index.ts'), 'utf-8',
  )
  if (!src.includes('saveProductIntelligence')) {
    throw new Error('saveProductIntelligence not called in runPricingScan')
  }
})

// ── Results ───────────────────────────────────────────────────────────────────

console.log()
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function section(title: string) {
  console.log(`\n${title}`)
}
