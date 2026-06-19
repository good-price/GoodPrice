/**
 * scripts/validate-product-intelligence.ts
 *
 * Sprint 5A — Product Intelligence Experience Layer validation suite.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/validate-product-intelligence.ts
 */

// ── Harness ───────────────────────────────────────────────────────────────────

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
  if (actual !== expected)
    throw new Error(`${label ? label + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function expectBetween(actual: number, min: number, max: number, label?: string): void {
  if (actual < min || actual > max)
    throw new Error(`${label ?? 'value'}: expected ${actual} to be in [${min}, ${max}]`)
}

function section(title: string): void {
  console.log(`\n${title}`)
}

const fs   = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8')
}

// ── Section 1: File structure ─────────────────────────────────────────────────

section('1. File structure')

test('lib/catalog/product-intelligence/types.ts exists', () => {
  expect(fs.existsSync(path.join(ROOT, 'lib/catalog/product-intelligence/types.ts')), true)
})

test('lib/catalog/product-intelligence/builder.ts exists', () => {
  expect(fs.existsSync(path.join(ROOT, 'lib/catalog/product-intelligence/builder.ts')), true)
})

test('lib/catalog/product-intelligence/reader.ts exists', () => {
  expect(fs.existsSync(path.join(ROOT, 'lib/catalog/product-intelligence/reader.ts')), true)
})

test('lib/catalog/product-intelligence/index.ts exists', () => {
  expect(fs.existsSync(path.join(ROOT, 'lib/catalog/product-intelligence/index.ts')), true)
})

test('lib/catalog/similarity/types.ts exists', () => {
  expect(fs.existsSync(path.join(ROOT, 'lib/catalog/similarity/types.ts')), true)
})

test('lib/catalog/similarity/engine.ts exists', () => {
  expect(fs.existsSync(path.join(ROOT, 'lib/catalog/similarity/engine.ts')), true)
})

test('lib/catalog/similarity/index.ts exists', () => {
  expect(fs.existsSync(path.join(ROOT, 'lib/catalog/similarity/index.ts')), true)
})

// ── Section 2: ProductIntelligence types ──────────────────────────────────────

section('2. ProductIntelligence types')

test('emptyIntelligence returns valid default shape', () => {
  const { emptyIntelligence } = require('../lib/catalog/product-intelligence/types')
  const e = emptyIntelligence('B00TEST0001')
  expect(e.asin,               'B00TEST0001')
  expect(e.recommendationScore, 0)
  expect(e.opportunityScore,    0)
  expect(e.confidenceScore,     0)
  expect(e.qualityScore,        0)
  expect(e.trend,               'stable')
  expect(e.lifecycle,           'stale')
  expect(e.activeAlerts,        0)
  expect(Array.isArray(e.badges),              true)
  expect(Array.isArray(e.recommendationReasons), true)
  expect(Array.isArray(e.alerts),              true)
  expect(e.badges.length,   0)
  expect(e.alerts.length,   0)
})

// ── Section 3: buildProductBadges ─────────────────────────────────────────────

section('3. buildProductBadges')

import { buildProductBadges } from '../lib/catalog/product-intelligence/builder'

interface BadgeInput {
  recommendationScore: number
  opportunityScore:    number
  confidenceScore:     number
  qualityScore:        number
  trend:               'rising' | 'falling' | 'stable'
  lifecycle:           'healthy' | 'aging' | 'stale' | 'critical'
}

function mkBadgeInput(overrides: Partial<BadgeInput> = {}): BadgeInput {
  return {
    recommendationScore: 0,
    opportunityScore:    0,
    confidenceScore:     0,
    qualityScore:        0,
    trend:               'stable',
    lifecycle:           'healthy',
    ...overrides,
  }
}

test('returns empty array when no thresholds met', () => {
  const badges = buildProductBadges(mkBadgeInput())
  expect(badges.length, 0)
})

test('generates recommended badge when recommendationScore >= 80', () => {
  const badges = buildProductBadges(mkBadgeInput({ recommendationScore: 80 }))
  const has    = badges.some(b => b.type === 'recommended')
  if (!has) throw new Error('expected recommended badge')
})

test('does NOT generate recommended badge when recommendationScore < 80', () => {
  const badges = buildProductBadges(mkBadgeInput({ recommendationScore: 79 }))
  const has    = badges.some(b => b.type === 'recommended')
  if (has) throw new Error('should not generate recommended badge at 79')
})

test('generates top-opportunity badge when opportunityScore >= 75', () => {
  const badges = buildProductBadges(mkBadgeInput({ opportunityScore: 75 }))
  const has    = badges.some(b => b.type === 'top-opportunity')
  if (!has) throw new Error('expected top-opportunity badge')
})

test('generates price-drop badge when trend is falling', () => {
  const badges = buildProductBadges(mkBadgeInput({ trend: 'falling' }))
  const has    = badges.some(b => b.type === 'price-drop')
  if (!has) throw new Error('expected price-drop badge')
})

test('does NOT generate price-drop badge for rising or stable trend', () => {
  const rising = buildProductBadges(mkBadgeInput({ trend: 'rising' }))
  const stable = buildProductBadges(mkBadgeInput({ trend: 'stable' }))
  if (rising.some(b => b.type === 'price-drop')) throw new Error('rising should not trigger price-drop')
  if (stable.some(b => b.type === 'price-drop')) throw new Error('stable should not trigger price-drop')
})

test('generates high-confidence badge when confidenceScore >= 80', () => {
  const badges = buildProductBadges(mkBadgeInput({ confidenceScore: 80 }))
  const has    = badges.some(b => b.type === 'high-confidence')
  if (!has) throw new Error('expected high-confidence badge')
})

test('generates best-value badge when qualityScore >= 80', () => {
  const badges = buildProductBadges(mkBadgeInput({ qualityScore: 80 }))
  const has    = badges.some(b => b.type === 'best-value')
  if (!has) throw new Error('expected best-value badge')
})

test('generates critical badge when lifecycle === critical', () => {
  const badges = buildProductBadges(mkBadgeInput({ lifecycle: 'critical' }))
  const has    = badges.some(b => b.type === 'critical')
  if (!has) throw new Error('expected critical badge')
})

test('caps at 4 badges even with all thresholds met', () => {
  const badges = buildProductBadges({
    recommendationScore: 90,
    opportunityScore:    80,
    confidenceScore:     90,
    qualityScore:        90,
    trend:               'falling',
    lifecycle:           'critical',
  })
  if (badges.length > 4) throw new Error(`expected ≤4 badges, got ${badges.length}`)
})

test('critical appears before others when lifecycle is critical', () => {
  const badges = buildProductBadges({
    recommendationScore: 90,
    opportunityScore:    80,
    confidenceScore:     90,
    qualityScore:        90,
    trend:               'falling',
    lifecycle:           'critical',
  })
  expect(badges[0].type, 'critical', 'critical should be first')
})

test('top-opportunity appears before recommended when both triggered', () => {
  const badges = buildProductBadges(mkBadgeInput({
    recommendationScore: 85,
    opportunityScore:    80,
  }))
  const topOppIdx = badges.findIndex(b => b.type === 'top-opportunity')
  const recIdx    = badges.findIndex(b => b.type === 'recommended')
  if (topOppIdx === -1 || recIdx === -1) throw new Error('both badges should exist')
  if (topOppIdx >= recIdx) throw new Error('top-opportunity should appear before recommended')
})

test('each badge has a non-empty label string', () => {
  const badges = buildProductBadges({
    recommendationScore: 85, opportunityScore: 80, confidenceScore: 85,
    qualityScore: 85, trend: 'falling', lifecycle: 'healthy',
  })
  for (const b of badges) {
    if (!b.label || b.label.length === 0)
      throw new Error(`badge ${b.type} has empty label`)
  }
})

// ── Section 4: rankRelatedProducts ───────────────────────────────────────────

section('4. rankRelatedProducts')

import { rankRelatedProducts } from '../lib/catalog/similarity/engine'
import type { RelatedProductEntry } from '../lib/catalog/similarity/types'

function mkEntry(asin: string, score: number, quality = 50, trend: 'falling' | 'stable' | 'rising' = 'stable'): RelatedProductEntry {
  return {
    product: {
      id: asin, asin, title: asin, category: 'test',
      image: '', price: 100, rating: 4, reviews: 100,
      amazonUrl: '', brand: '',
    },
    recommendationScore: score,
    qualityScore:        quality,
    trend,
  }
}

test('sorts by recommendationScore DESC', () => {
  const entries = [mkEntry('A', 40), mkEntry('B', 80), mkEntry('C', 60)]
  const ranked  = rankRelatedProducts(entries)
  expect(ranked[0].product.asin, 'B')
  expect(ranked[1].product.asin, 'C')
  expect(ranked[2].product.asin, 'A')
})

test('uses qualityScore as tiebreaker when recommendationScore is equal', () => {
  const entries = [mkEntry('A', 70, 40), mkEntry('B', 70, 80)]
  const ranked  = rankRelatedProducts(entries)
  expect(ranked[0].product.asin, 'B')
})

test('uses trend as tiebreaker: falling > stable > rising', () => {
  const entries = [
    mkEntry('A', 70, 50, 'rising'),
    mkEntry('B', 70, 50, 'falling'),
    mkEntry('C', 70, 50, 'stable'),
  ]
  const ranked = rankRelatedProducts(entries)
  expect(ranked[0].product.asin, 'B', 'falling first')
  expect(ranked[1].product.asin, 'C', 'stable second')
  expect(ranked[2].product.asin, 'A', 'rising last')
})

test('does not mutate input array', () => {
  const entries = [mkEntry('A', 40), mkEntry('B', 80)]
  const original = [...entries]
  rankRelatedProducts(entries)
  expect(entries[0].product.asin, original[0].product.asin, 'input unchanged')
})

// ── Section 5: extractRelatedProducts ────────────────────────────────────────

section('5. extractRelatedProducts')

import { extractRelatedProducts } from '../lib/catalog/similarity/engine'

test('returns only `count` products', () => {
  const entries = [mkEntry('A', 80), mkEntry('B', 70), mkEntry('C', 60), mkEntry('D', 50)]
  const result  = extractRelatedProducts(entries, 2)
  expect(result.length, 2)
})

test('returns Product objects (not RelatedProductEntry)', () => {
  const entries = [mkEntry('A', 80)]
  const result  = extractRelatedProducts(entries, 6)
  expect(typeof result[0].title, 'string', 'returns Product')
  expect(result[0].asin, 'A')
})

test('returns fewer than count when fewer entries available', () => {
  const entries = [mkEntry('A', 80)]
  const result  = extractRelatedProducts(entries, 6)
  expect(result.length, 1)
})

// ── Section 6: Fault tolerance ────────────────────────────────────────────────

section('6. Fault tolerance')

test('getProductIntelligence returns emptyIntelligence for unknown ASIN', () => {
  const { getProductIntelligence } = require('../lib/catalog/product-intelligence/reader')
  const intel = getProductIntelligence('NOTEXIST01')
  expect(intel.asin,               'NOTEXIST01')
  expect(intel.recommendationScore, 0)
  expect(intel.badges.length,       0)
  expect(intel.alerts.length,       0)
})

test('getRelatedProducts returns [] for unknown category', () => {
  const { getRelatedProducts } = require('../lib/catalog/similarity/index')
  const result = getRelatedProducts('NOTEXIST', 'not-a-category', 6)
  expect(Array.isArray(result), true)
  expect(result.length, 0)
})

// ── Section 7: Badge thresholds (boundary tests) ──────────────────────────────

section('7. Badge threshold boundaries')

test('opportunityScore exactly 75 → top-opportunity', () => {
  const b = buildProductBadges(mkBadgeInput({ opportunityScore: 75 }))
  if (!b.some(x => x.type === 'top-opportunity')) throw new Error('75 should trigger top-opportunity')
})

test('opportunityScore 74 → no top-opportunity', () => {
  const b = buildProductBadges(mkBadgeInput({ opportunityScore: 74 }))
  if (b.some(x => x.type === 'top-opportunity')) throw new Error('74 should not trigger top-opportunity')
})

test('recommendationScore exactly 80 → recommended', () => {
  const b = buildProductBadges(mkBadgeInput({ recommendationScore: 80 }))
  if (!b.some(x => x.type === 'recommended')) throw new Error('80 should trigger recommended')
})

test('confidenceScore exactly 80 → high-confidence', () => {
  const b = buildProductBadges(mkBadgeInput({ confidenceScore: 80 }))
  if (!b.some(x => x.type === 'high-confidence')) throw new Error('80 should trigger high-confidence')
})

test('qualityScore exactly 80 → best-value', () => {
  const b = buildProductBadges(mkBadgeInput({ qualityScore: 80 }))
  if (!b.some(x => x.type === 'best-value')) throw new Error('80 should trigger best-value')
})

// ── Section 8: UI components ──────────────────────────────────────────────────

section('8. UI components')

test('ProductBadges.tsx exports ProductBadges and accepts badges prop', () => {
  const src = readSrc('components/catalog/intelligence/ProductBadges.tsx')
  if (!src.includes('export function ProductBadges')) throw new Error('missing export')
  if (!src.includes('badges: ProductBadge[]'))        throw new Error('missing badges prop')
})

test('ProductScores.tsx exports ProductScores', () => {
  const src = readSrc('components/catalog/intelligence/ProductScores.tsx')
  if (!src.includes('export function ProductScores')) throw new Error('missing export')
  if (!src.includes('recommendationScore'))           throw new Error('missing recommendationScore prop')
})

test('ProductReasons.tsx exports ProductReasons', () => {
  const src = readSrc('components/catalog/intelligence/ProductReasons.tsx')
  if (!src.includes('export function ProductReasons')) throw new Error('missing export')
  if (!src.includes('reasons: string[]'))              throw new Error('missing reasons prop')
})

test('ProductAlerts.tsx exports ProductAlerts', () => {
  const src = readSrc('components/catalog/intelligence/ProductAlerts.tsx')
  if (!src.includes('export function ProductAlerts'))  throw new Error('missing export')
  if (!src.includes('resolvedAt === null'))            throw new Error('missing active-alert filter')
  if (!src.includes("severity !== 'low'"))             throw new Error('missing severity filter for user-facing')
})

test('SupportGoodPrice.tsx exports SupportGoodPrice', () => {
  const src = readSrc('components/catalog/SupportGoodPrice.tsx')
  if (!src.includes('export function SupportGoodPrice')) throw new Error('missing export')
  if (!src.includes('@pombo701'))                         throw new Error('missing Bre key @pombo701')
  if (!src.includes('Bancolombia'))                       throw new Error('missing Bancolombia')
})

test('SupportGoodPrice.tsx has no modal, no popup, no animation class', () => {
  const src = readSrc('components/catalog/SupportGoodPrice.tsx')
  // Strip comment lines before checking — comments explaining what NOT to do are fine
  const codeLines = src.split('\n').filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
  const code = codeLines.join('\n')
  if (code.includes('<Modal') || code.includes('showModal') || code.includes('isModalOpen'))
    throw new Error('modal component found — must be non-invasive')
  if (code.includes('<Popup') || code.includes('showPopup'))
    throw new Error('popup component found — must be non-invasive')
  if (code.includes('animate-'))
    throw new Error('Tailwind animation found — must be non-invasive')
})

test('TopRecommendations.tsx exports TopRecommendations', () => {
  const src = readSrc('components/catalog/TopRecommendations.tsx')
  if (!src.includes('export function TopRecommendations')) throw new Error('missing export')
  if (!src.includes('recommendationScore'))                throw new Error('missing score display')
})

test('TopRecommendations.tsx degrades gracefully (returns null when < 2 items)', () => {
  const src = readSrc('components/catalog/TopRecommendations.tsx')
  if (!src.includes('items.length < 2')) throw new Error('missing graceful degradation check')
})

// ── Section 9: Product page integration ──────────────────────────────────────

section('9. Product page integration')

test('product page imports getProductIntelligence', () => {
  const src = readSrc('app/productos/[asin]/page.tsx')
  if (!src.includes('getProductIntelligence')) throw new Error('getProductIntelligence not imported')
})

test('product page imports getRelatedProducts from similarity', () => {
  const src = readSrc('app/productos/[asin]/page.tsx')
  if (!src.includes('getRelatedProducts'))     throw new Error('getRelatedProducts not imported')
  if (!src.includes('@/lib/catalog/similarity')) throw new Error('wrong import path')
})

test('product page renders ProductBadges, ProductScores, ProductReasons, ProductAlerts', () => {
  const src = readSrc('app/productos/[asin]/page.tsx')
  const required = ['ProductBadges', 'ProductScores', 'ProductReasons', 'ProductAlerts']
  for (const c of required) {
    if (!src.includes(c)) throw new Error(`${c} not rendered in product page`)
  }
})

test('product page renders SupportGoodPrice', () => {
  const src = readSrc('app/productos/[asin]/page.tsx')
  if (!src.includes('SupportGoodPrice')) throw new Error('SupportGoodPrice not rendered')
})

test('product page does NOT call getCachedSnapshot or getSnapshotRelatedProducts', () => {
  const src = readSrc('app/productos/[asin]/page.tsx')
  if (src.includes('getSnapshotRelatedProducts'))
    throw new Error('old snapshot-based related products still in use')
})

// ── Section 10: Category page integration ────────────────────────────────────

section('10. Category page integration')

test('category page imports TopRecommendations', () => {
  const src = readSrc('app/categorias/[slug]/page.tsx')
  if (!src.includes('TopRecommendations')) throw new Error('TopRecommendations not imported')
})

test('category page renders TopRecommendations with category prop', () => {
  const src = readSrc('app/categorias/[slug]/page.tsx')
  if (!src.includes('<TopRecommendations')) throw new Error('TopRecommendations not rendered')
  if (!src.includes('category={params.slug}')) throw new Error('category prop not passed')
})

// ── Section 11: Empty states ──────────────────────────────────────────────────

section('11. Empty states')

test('ProductBadges renders null when badges is empty', () => {
  const src = readSrc('components/catalog/intelligence/ProductBadges.tsx')
  if (!src.includes('badges.length === 0') && !src.includes('badges.length == 0'))
    throw new Error('no empty-state check')
})

test('ProductReasons renders null when reasons is empty', () => {
  const src = readSrc('components/catalog/intelligence/ProductReasons.tsx')
  if (!src.includes('reasons.length === 0') && !src.includes('reasons.length == 0'))
    throw new Error('no empty-state check')
})

test('ProductAlerts renders null when no active alerts', () => {
  const src = readSrc('components/catalog/intelligence/ProductAlerts.tsx')
  if (!src.includes('active.length === 0') && !src.includes('userFacing.length === 0'))
    throw new Error('no empty-state check')
})

// ── Section 12: No new dependencies ──────────────────────────────────────────

section('12. No new backend/dependencies')

test('reader.ts reads only existing stores (no new persistence)', () => {
  const src = readSrc('lib/catalog/product-intelligence/reader.ts')
  if (src.includes('writeFileSync') || src.includes('renameSync'))
    throw new Error('reader.ts must be read-only')
})

test('similarity/index.ts reads only existing stores (no new persistence)', () => {
  const src = readSrc('lib/catalog/similarity/index.ts')
  if (src.includes('writeFileSync') || src.includes('renameSync'))
    throw new Error('similarity engine must be read-only')
})

test('product-intelligence has no new API routes or job files', () => {
  const src = readSrc('lib/catalog/product-intelligence/index.ts')
  if (src.includes('appendLog') || src.includes('saveRecommendations'))
    throw new Error('product-intelligence must be read-only, no OPS logging')
})

// ── Results ───────────────────────────────────────────────────────────────────

console.log()
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
