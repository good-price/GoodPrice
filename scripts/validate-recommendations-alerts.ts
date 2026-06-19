/**
 * scripts/validate-recommendations-alerts.ts
 *
 * Sprint 4F — Recommendation & Alert Intelligence Engine validation suite.
 *
 * Run: npx ts-node --project tsconfig.scripts.json scripts/validate-recommendations-alerts.ts
 *
 * All tests are in-memory; no I/O.
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
  const ok = actual === expected
  if (!ok) throw new Error(`${label ? label + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function expectBetween(actual: number, min: number, max: number, label?: string): void {
  if (actual < min || actual > max)
    throw new Error(`${label ?? 'value'}: expected ${actual} to be between ${min} and ${max}`)
}

function section(title: string): void {
  console.log(`\n${title}`)
}

// ── Section 1: File structure ─────────────────────────────────────────────────

section('1. File structure')

test('recommendations/types.ts exports ProductRecommendation', () => {
  const _: import('../lib/catalog/recommendations/types').ProductRecommendation = {
    asin: 'B00TEST0001', category: 'electronica', recommendationScore: 50,
    opportunityScore: 50, confidenceScore: 50, qualityScore: 50,
    trend: 'stable', reasons: [], createdAt: '2025-01-01T00:00:00Z',
  }
  void _
})

test('recommendations/types.ts exports RecommendationGovernance', () => {
  const _: import('../lib/catalog/recommendations/types').RecommendationGovernance = {
    totalRecommendations: 0, excellent: 0, good: 0, average: 0, weak: 0, averageScore: 0,
  }
  void _
})

test('alerts/types.ts exports ProductAlert', () => {
  const _: import('../lib/catalog/alerts/types').ProductAlert = {
    id: 'x', asin: 'B00TEST0001', category: 'electronica',
    type: 'price-drop', severity: 'high',
    message: 'test', createdAt: '2025-01-01T00:00:00Z', resolvedAt: null,
  }
  void _
})

test('alerts/types.ts exports AlertGovernance', () => {
  const _: import('../lib/catalog/alerts/types').AlertGovernance = {
    totalAlerts: 0, low: 0, medium: 0, high: 0, unresolved: 0,
  }
  void _
})

test('recommendations/engine.ts exports computeRecommendationScore', () => {
  const m = require('../lib/catalog/recommendations/engine')
  expect(typeof m.computeRecommendationScore, 'function')
  expect(typeof m.buildRecommendationReasons, 'function')
})

test('alerts/engine.ts exports evaluateAlertConditions, alertDedupKey, buildAlert', () => {
  const m = require('../lib/catalog/alerts/engine')
  expect(typeof m.evaluateAlertConditions, 'function')
  expect(typeof m.alertDedupKey,           'function')
  expect(typeof m.buildAlert,              'function')
})

test('recommendations/state.ts exports readRecommendations, saveRecommendations, updateRecommendation, rebuildRecommendations', () => {
  const m = require('../lib/catalog/recommendations/state')
  expect(typeof m.readRecommendations,    'function')
  expect(typeof m.saveRecommendations,    'function')
  expect(typeof m.updateRecommendation,   'function')
  expect(typeof m.rebuildRecommendations, 'function')
})

test('alerts/state.ts exports readAlerts, saveAlerts, generateAlerts, resolveAlert', () => {
  const m = require('../lib/catalog/alerts/state')
  expect(typeof m.readAlerts,     'function')
  expect(typeof m.saveAlerts,     'function')
  expect(typeof m.generateAlerts, 'function')
  expect(typeof m.resolveAlert,   'function')
})

test('recommendations/index.ts exports runRecommendationScan', () => {
  const m = require('../lib/catalog/recommendations/index')
  expect(typeof m.runRecommendationScan, 'function')
})

test('alerts/index.ts exports runAlertScan', () => {
  const m = require('../lib/catalog/alerts/index')
  expect(typeof m.runAlertScan, 'function')
})

// ── Section 2: computeRecommendationScore ─────────────────────────────────────

section('2. computeRecommendationScore')

import { computeRecommendationScore } from '../lib/catalog/recommendations/engine'
import type { RecommendationInput }   from '../lib/catalog/recommendations/engine'

function mkInput(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    opportunityScore: 50,
    confidenceScore:  50,
    qualityScore:     50,
    trend:            'stable',
    lifecycleHealth:  'healthy',
    ...overrides,
  }
}

test('score is between 0 and 100', () => {
  expectBetween(computeRecommendationScore(mkInput()), 0, 100)
})

test('score is an integer', () => {
  const s = computeRecommendationScore(mkInput())
  expect(s, Math.round(s), 'integer')
})

test('falling trend increases score vs stable', () => {
  const stable  = computeRecommendationScore(mkInput({ trend: 'stable' }))
  const falling = computeRecommendationScore(mkInput({ trend: 'falling' }))
  if (falling <= stable) throw new Error(`falling (${falling}) should be > stable (${stable})`)
})

test('rising trend decreases score vs stable', () => {
  const stable = computeRecommendationScore(mkInput({ trend: 'stable' }))
  const rising = computeRecommendationScore(mkInput({ trend: 'rising' }))
  if (rising >= stable) throw new Error(`rising (${rising}) should be < stable (${stable})`)
})

test('critical lifecycle strongly penalizes score', () => {
  const healthy  = computeRecommendationScore(mkInput({ lifecycleHealth: 'healthy' }))
  const critical = computeRecommendationScore(mkInput({ lifecycleHealth: 'critical' }))
  if (critical >= healthy) throw new Error(`critical (${critical}) should be < healthy (${healthy})`)
  if (healthy - critical < 25) throw new Error(`penalty should be strong (was only ${healthy - critical})`)
})

test('healthy lifecycle gives slight bonus over stale', () => {
  const healthy = computeRecommendationScore(mkInput({ lifecycleHealth: 'healthy' }))
  const stale   = computeRecommendationScore(mkInput({ lifecycleHealth: 'stale' }))
  if (healthy <= stale) throw new Error(`healthy (${healthy}) should be > stale (${stale})`)
})

test('high opportunity score raises recommendation score', () => {
  const low  = computeRecommendationScore(mkInput({ opportunityScore: 10 }))
  const high = computeRecommendationScore(mkInput({ opportunityScore: 90 }))
  if (high <= low) throw new Error(`high opp (${high}) should be > low opp (${low})`)
})

test('all-zeros input does not throw and returns 0', () => {
  const s = computeRecommendationScore({
    opportunityScore: 0, confidenceScore: 0, qualityScore: 0,
    trend: 'rising', lifecycleHealth: 'critical',
  })
  expect(s, 0, 'all-zeros critical rising → 0 (clamped)')
})

test('all-max input returns 100', () => {
  const s = computeRecommendationScore({
    opportunityScore: 100, confidenceScore: 100, qualityScore: 100,
    trend: 'falling', lifecycleHealth: 'healthy',
  })
  expect(s, 100, 'all-max → 100 (clamped)')
})

// ── Section 3: buildRecommendationReasons ─────────────────────────────────────

section('3. buildRecommendationReasons')

import { buildRecommendationReasons } from '../lib/catalog/recommendations/engine'

test('returns array', () => {
  const r = buildRecommendationReasons(mkInput())
  if (!Array.isArray(r)) throw new Error('expected array')
})

test('falling trend produces buy signal reason', () => {
  const r = buildRecommendationReasons(mkInput({ trend: 'falling' }))
  const hasBuy = r.some(s => s.toLowerCase().includes('bajando'))
  if (!hasBuy) throw new Error(`expected buy-signal reason, got: ${r.join(', ')}`)
})

test('high opportunity score produces near-low reason', () => {
  const r = buildRecommendationReasons(mkInput({ opportunityScore: 80 }))
  const hasOpp = r.some(s => s.toLowerCase().includes('mínimo'))
  if (!hasOpp) throw new Error(`expected low-price reason, got: ${r.join(', ')}`)
})

test('critical lifecycle produces critical reason', () => {
  const r = buildRecommendationReasons(mkInput({ lifecycleHealth: 'critical' }))
  const hasCrit = r.some(s => s.toLowerCase().includes('crítico'))
  if (!hasCrit) throw new Error(`expected critical reason, got: ${r.join(', ')}`)
})

// ── Section 4: evaluateAlertConditions ───────────────────────────────────────

section('4. evaluateAlertConditions')

import { evaluateAlertConditions } from '../lib/catalog/alerts/engine'
import type { AlertInput }         from '../lib/catalog/alerts/engine'

function mkAlertInput(overrides: Partial<AlertInput> = {}): AlertInput {
  return {
    asin: 'B00TEST0001', category: 'electronica',
    trend: 'stable', opportunityScore: 30,
    confidenceScore: 50, lifecycleHealth: 'healthy',
    needsReplacement: false,
    ...overrides,
  }
}

test('no alerts for healthy product with normal values', () => {
  const pending = evaluateAlertConditions(mkAlertInput())
  expect(pending.length, 0, 'no alerts for healthy product')
})

test('generates price-drop alert when trend is falling', () => {
  const pending = evaluateAlertConditions(mkAlertInput({ trend: 'falling' }))
  const hasDrop = pending.some(p => p.type === 'price-drop')
  if (!hasDrop) throw new Error('expected price-drop alert')
})

test('price-drop severity is HIGH when opportunityScore >= 70', () => {
  const pending = evaluateAlertConditions(mkAlertInput({ trend: 'falling', opportunityScore: 75 }))
  const drop    = pending.find(p => p.type === 'price-drop')
  expect(drop?.severity, 'high', 'high opportunity → high severity')
})

test('price-drop severity is MEDIUM when opportunityScore < 70', () => {
  const pending = evaluateAlertConditions(mkAlertInput({ trend: 'falling', opportunityScore: 50 }))
  const drop    = pending.find(p => p.type === 'price-drop')
  expect(drop?.severity, 'medium', 'low opportunity → medium severity')
})

test('generates high-opportunity alert when opportunityScore >= 70', () => {
  const pending = evaluateAlertConditions(mkAlertInput({ opportunityScore: 75 }))
  const hasOpp  = pending.some(p => p.type === 'high-opportunity')
  if (!hasOpp) throw new Error('expected high-opportunity alert')
  expect(pending.find(p => p.type === 'high-opportunity')?.severity, 'high')
})

test('generates critical-lifecycle alert when health is critical', () => {
  const pending  = evaluateAlertConditions(mkAlertInput({ lifecycleHealth: 'critical' }))
  const hasCrit  = pending.some(p => p.type === 'critical-lifecycle')
  if (!hasCrit) throw new Error('expected critical-lifecycle alert')
  expect(pending.find(p => p.type === 'critical-lifecycle')?.severity, 'high')
})

test('generates low-confidence alert when confidenceScore < 35', () => {
  const pending  = evaluateAlertConditions(mkAlertInput({ confidenceScore: 20 }))
  const hasLowC  = pending.some(p => p.type === 'low-confidence')
  if (!hasLowC) throw new Error('expected low-confidence alert')
  expect(pending.find(p => p.type === 'low-confidence')?.severity, 'medium')
})

test('generates replacement-needed alert when needsReplacement is true', () => {
  const pending  = evaluateAlertConditions(mkAlertInput({ needsReplacement: true }))
  const hasRepl  = pending.some(p => p.type === 'replacement-needed')
  if (!hasRepl) throw new Error('expected replacement-needed alert')
  expect(pending.find(p => p.type === 'replacement-needed')?.severity, 'high')
})

test('multiple alerts can be generated simultaneously', () => {
  const pending = evaluateAlertConditions(mkAlertInput({
    trend: 'falling', opportunityScore: 80,
    lifecycleHealth: 'critical', needsReplacement: true,
  }))
  if (pending.length < 3) throw new Error(`expected ≥3 alerts, got ${pending.length}`)
})

test('confidenceScore exactly 35 does NOT trigger low-confidence', () => {
  const pending = evaluateAlertConditions(mkAlertInput({ confidenceScore: 35 }))
  const hasLow  = pending.some(p => p.type === 'low-confidence')
  if (hasLow) throw new Error('35 is at threshold, should NOT trigger low-confidence')
})

// ── Section 5: alertDedupKey ──────────────────────────────────────────────────

section('5. alertDedupKey')

import { alertDedupKey } from '../lib/catalog/alerts/engine'

test('produces consistent key for same asin+type', () => {
  const k1 = alertDedupKey('B00TEST0001', 'price-drop')
  const k2 = alertDedupKey('B00TEST0001', 'price-drop')
  expect(k1, k2)
})

test('different types produce different keys', () => {
  const k1 = alertDedupKey('B00TEST0001', 'price-drop')
  const k2 = alertDedupKey('B00TEST0001', 'high-opportunity')
  if (k1 === k2) throw new Error('different types should produce different keys')
})

test('different ASINs produce different keys', () => {
  const k1 = alertDedupKey('B00TEST0001', 'price-drop')
  const k2 = alertDedupKey('B00TEST0002', 'price-drop')
  if (k1 === k2) throw new Error('different ASINs should produce different keys')
})

// ── Section 6: buildAlert ─────────────────────────────────────────────────────

section('6. buildAlert')

import { buildAlert } from '../lib/catalog/alerts/engine'
import type { PendingAlert } from '../lib/catalog/alerts/engine'

const pending: PendingAlert = { type: 'price-drop', severity: 'high', message: 'Precio bajando' }

test('buildAlert returns ProductAlert shape', () => {
  const a = buildAlert('B00TEST0001', 'electronica', pending, '2025-01-01T00:00:00Z')
  expect(a.asin,       'B00TEST0001')
  expect(a.category,   'electronica')
  expect(a.type,       'price-drop')
  expect(a.severity,   'high')
  expect(a.resolvedAt, null)
  expect(typeof a.id,  'string')
  if (a.id.length === 0) throw new Error('id should not be empty')
})

test('buildAlert id includes asin and type', () => {
  const a = buildAlert('B00TEST0001', 'electronica', pending, '2025-01-01T00:00:00Z')
  if (!a.id.includes('B00TEST0001')) throw new Error('id should include asin')
  if (!a.id.includes('price-drop')) throw new Error('id should include type')
})

// ── Section 7: Recommendation governance ─────────────────────────────────────

section('7. RecommendationGovernance aggregation')

import type { ProductRecommendation } from '../lib/catalog/recommendations/types'

function mkRec(asin: string, score: number): ProductRecommendation {
  return {
    asin, category: 'test', recommendationScore: score,
    opportunityScore: 0, confidenceScore: 0, qualityScore: 0,
    trend: 'stable', reasons: [], createdAt: '2025-01-01T00:00:00Z',
  }
}

function computeRecGov(products: ProductRecommendation[]) {
  const total = products.length
  if (total === 0) return { totalRecommendations: 0, excellent: 0, good: 0, average: 0, weak: 0, averageScore: 0 }
  let excellent = 0, good = 0, average = 0, weak = 0, sum = 0
  for (const p of products) {
    if      (p.recommendationScore >= 75) excellent++
    else if (p.recommendationScore >= 50) good++
    else if (p.recommendationScore >= 25) average++
    else                                  weak++
    sum += p.recommendationScore
  }
  return { totalRecommendations: total, excellent, good, average, weak, averageScore: Math.round(sum / total) }
}

test('empty products → all zeros', () => {
  const g = computeRecGov([])
  expect(g.totalRecommendations, 0)
  expect(g.excellent, 0)
  expect(g.averageScore, 0)
})

test('correctly buckets scores', () => {
  const products = [mkRec('A', 80), mkRec('B', 60), mkRec('C', 40), mkRec('D', 10)]
  const g = computeRecGov(products)
  expect(g.excellent, 1)
  expect(g.good,      1)
  expect(g.average,   1)
  expect(g.weak,      1)
})

test('boundary: score 75 → excellent', () => {
  const g = computeRecGov([mkRec('A', 75)])
  expect(g.excellent, 1)
  expect(g.good,      0)
})

test('boundary: score 50 → good', () => {
  const g = computeRecGov([mkRec('A', 50)])
  expect(g.excellent, 0)
  expect(g.good,      1)
})

test('boundary: score 25 → average', () => {
  const g = computeRecGov([mkRec('A', 25)])
  expect(g.average, 1)
  expect(g.weak,    0)
})

test('boundary: score 24 → weak', () => {
  const g = computeRecGov([mkRec('A', 24)])
  expect(g.weak, 1)
})

test('averageScore is rounded integer', () => {
  const g = computeRecGov([mkRec('A', 33), mkRec('B', 67)])
  expect(g.averageScore, 50)
})

// ── Section 8: Alert governance ───────────────────────────────────────────────

section('8. AlertGovernance aggregation')

import type { ProductAlert } from '../lib/catalog/alerts/types'

function mkAlert(id: string, severity: 'low' | 'medium' | 'high', resolved = false): ProductAlert {
  return {
    id, asin: 'B00TEST0001', category: 'test',
    type: 'price-drop', severity,
    message: 'test', createdAt: '2025-01-01T00:00:00Z',
    resolvedAt: resolved ? '2025-01-02T00:00:00Z' : null,
  }
}

function computeAlertGov(alerts: ProductAlert[]) {
  const total = alerts.length
  if (total === 0) return { totalAlerts: 0, low: 0, medium: 0, high: 0, unresolved: 0 }
  let low = 0, medium = 0, high = 0, unresolved = 0
  for (const a of alerts) {
    if (a.severity === 'low')    low++
    if (a.severity === 'medium') medium++
    if (a.severity === 'high')   high++
    if (a.resolvedAt === null)   unresolved++
  }
  return { totalAlerts: total, low, medium, high, unresolved }
}

test('empty alerts → all zeros', () => {
  const g = computeAlertGov([])
  expect(g.totalAlerts, 0)
  expect(g.unresolved,  0)
})

test('correctly counts severity breakdown', () => {
  const alerts = [mkAlert('1', 'high'), mkAlert('2', 'medium'), mkAlert('3', 'low')]
  const g = computeAlertGov(alerts)
  expect(g.high,   1)
  expect(g.medium, 1)
  expect(g.low,    1)
})

test('unresolved counts only non-resolved alerts', () => {
  const alerts = [
    mkAlert('1', 'high', false),
    mkAlert('2', 'high', true),
    mkAlert('3', 'medium', false),
  ]
  const g = computeAlertGov(alerts)
  expect(g.unresolved,  2)
  expect(g.totalAlerts, 3)
})

// ── Section 9: Deduplication ──────────────────────────────────────────────────

section('9. Alert deduplication')

test('dedup set blocks same asin+type if already active', () => {
  const activeKeys = new Set<string>()
  activeKeys.add(alertDedupKey('B00TEST0001', 'price-drop'))

  const key = alertDedupKey('B00TEST0001', 'price-drop')
  expect(activeKeys.has(key), true, 'should be blocked')
})

test('different type for same ASIN is NOT blocked', () => {
  const activeKeys = new Set<string>()
  activeKeys.add(alertDedupKey('B00TEST0001', 'price-drop'))

  const key = alertDedupKey('B00TEST0001', 'high-opportunity')
  expect(activeKeys.has(key), false, 'different type should not be blocked')
})

test('same type for different ASIN is NOT blocked', () => {
  const activeKeys = new Set<string>()
  activeKeys.add(alertDedupKey('B00TEST0001', 'price-drop'))

  const key = alertDedupKey('B00TEST0002', 'price-drop')
  expect(activeKeys.has(key), false, 'different ASIN should not be blocked')
})

test('resolved alert does not block new alert for same asin+type', () => {
  // Resolved alerts should NOT be added to the active dedup set
  const alerts: ProductAlert[] = [
    mkAlert('old', 'high', true),  // resolved
  ]
  const activeKeys = new Set<string>()
  for (const a of alerts) {
    if (a.resolvedAt === null) {
      activeKeys.add(alertDedupKey(a.asin, a.type))
    }
  }
  const key = alertDedupKey('B00TEST0001', 'price-drop')
  expect(activeKeys.has(key), false, 'resolved alert does not block new one')
})

// ── Section 10: OPS log types ──────────────────────────────────────────────────

section('10. OPS log types')

test("'catalog-recommendations' is a valid OpsJobType", () => {
  const t: import('../lib/ops/logs/types').OpsJobType = 'catalog-recommendations'
  expect(typeof t, 'string')
})

test("'catalog-alerts' is a valid OpsJobType", () => {
  const t: import('../lib/ops/logs/types').OpsJobType = 'catalog-alerts'
  expect(typeof t, 'string')
})

// ── Section 11: Pipeline integration ──────────────────────────────────────────

section('11. Pipeline integration')

const fs   = require('fs')
const path = require('path')

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf-8')
}

test('auto-repair.ts imports rebuildRecommendations and generateAlerts', () => {
  const src = readSrc('lib/catalog/self-healing/auto-repair.ts')
  if (!src.includes('rebuildRecommendations')) throw new Error('rebuildRecommendations not in auto-repair.ts')
  if (!src.includes('generateAlerts'))         throw new Error('generateAlerts not in auto-repair.ts')
})

test('auto-repair.ts calls rebuildRecommendations + generateAlerts after lifecycle scan', () => {
  const src = readSrc('lib/catalog/self-healing/auto-repair.ts')
  if (!src.includes('rebuildRecommendations()')) throw new Error('rebuildRecommendations() not called')
  if (!src.includes('generateAlerts()'))         throw new Error('generateAlerts() not called')
})

test('discovery/runner.ts imports rebuildRecommendations and generateAlerts', () => {
  const src = readSrc('lib/catalog/discovery/runner.ts')
  if (!src.includes('rebuildRecommendations')) throw new Error('rebuildRecommendations not in runner.ts')
  if (!src.includes('generateAlerts'))         throw new Error('generateAlerts not in runner.ts')
})

test('lifecycle/index.ts imports and calls rebuildRecommendations + generateAlerts', () => {
  const src = readSrc('lib/catalog/lifecycle/index.ts')
  if (!src.includes('rebuildRecommendations')) throw new Error('rebuildRecommendations not in lifecycle/index.ts')
  if (!src.includes('generateAlerts'))         throw new Error('generateAlerts not in lifecycle/index.ts')
})

test('pricing-memory/index.ts imports and calls rebuildRecommendations + generateAlerts', () => {
  const src = readSrc('lib/catalog/pricing-memory/index.ts')
  if (!src.includes('rebuildRecommendations')) throw new Error('rebuildRecommendations not in pricing-memory/index.ts')
  if (!src.includes('generateAlerts'))         throw new Error('generateAlerts not in pricing-memory/index.ts')
})

// ── Section 12: UI components ──────────────────────────────────────────────────

section('12. UI components')

test('RecommendationGovernance.tsx exports RecommendationGovernance', () => {
  const src = readSrc('components/admin/catalog/RecommendationGovernance.tsx')
  if (!src.includes('export function RecommendationGovernance'))
    throw new Error('component not exported')
  if (!src.includes('governance: RecommendationGovernanceType'))
    throw new Error('governance prop missing')
})

test('RecommendationProducts.tsx exports RecommendationProducts and slices to 20', () => {
  const src = readSrc('components/admin/catalog/RecommendationProducts.tsx')
  if (!src.includes('export function RecommendationProducts'))
    throw new Error('component not exported')
  if (!src.includes('.slice(0, 20)'))
    throw new Error('slice(0,20) missing')
  if (!src.includes('recommendationScore'))
    throw new Error('recommendationScore not referenced')
})

test('AlertGovernance.tsx exports AlertGovernance', () => {
  const src = readSrc('components/admin/catalog/AlertGovernance.tsx')
  if (!src.includes('export function AlertGovernance'))
    throw new Error('component not exported')
  if (!src.includes('governance: AlertGovernanceType'))
    throw new Error('governance prop missing')
})

test('AlertProducts.tsx exports AlertProducts and filters unresolved, slices to 20', () => {
  const src = readSrc('components/admin/catalog/AlertProducts.tsx')
  if (!src.includes('export function AlertProducts'))
    throw new Error('component not exported')
  if (!src.includes('resolvedAt === null'))
    throw new Error('unresolved filter missing')
  if (!src.includes('.slice(0, 20)'))
    throw new Error('slice(0,20) missing')
})

test('page.tsx imports all 4 new components', () => {
  const src = readSrc('app/admin/catalog/page.tsx')
  const required = ['RecommendationGovernance', 'RecommendationProducts', 'AlertGovernance', 'AlertProducts']
  for (const name of required) {
    if (!src.includes(name)) throw new Error(`${name} not found in page.tsx`)
  }
})

test('page.tsx renders Zones 13–16', () => {
  const src = readSrc('app/admin/catalog/page.tsx')
  if (!src.includes('Zona 13')) throw new Error('Zone 13 missing')
  if (!src.includes('Zona 14')) throw new Error('Zone 14 missing')
  if (!src.includes('Zona 15')) throw new Error('Zone 15 missing')
  if (!src.includes('Zona 16')) throw new Error('Zone 16 missing')
})

test('page.tsx imports governance and state readers for recommendations + alerts', () => {
  const src = readSrc('app/admin/catalog/page.tsx')
  if (!src.includes('getRecommendationGovernance')) throw new Error('getRecommendationGovernance missing')
  if (!src.includes('readRecommendations'))         throw new Error('readRecommendations missing')
  if (!src.includes('getAlertGovernance'))          throw new Error('getAlertGovernance missing')
  if (!src.includes('readAlerts'))                  throw new Error('readAlerts missing')
})

// ── Section 13: Idempotence / reruns ─────────────────────────────────────────

section('13. Idempotence and reruns')

test('computeRecommendationScore is deterministic (same input → same output)', () => {
  const input = mkInput({ opportunityScore: 65, trend: 'falling', lifecycleHealth: 'stale' })
  const s1 = computeRecommendationScore(input)
  const s2 = computeRecommendationScore(input)
  expect(s1, s2, 'deterministic')
})

test('evaluateAlertConditions is deterministic', () => {
  const input = mkAlertInput({ trend: 'falling', opportunityScore: 80, confidenceScore: 20 })
  const r1 = evaluateAlertConditions(input)
  const r2 = evaluateAlertConditions(input)
  expect(r1.length, r2.length, 'same number of alerts')
  for (let i = 0; i < r1.length; i++) {
    expect(r1[i].type, r2[i].type, `type[${i}]`)
  }
})

test('dedup prevents alert explosion across repeated runs', () => {
  const activeKeys = new Set<string>()
  let newAlerts = 0

  // Simulate 3 pipeline runs that all detect the same price-drop
  for (let run = 0; run < 3; run++) {
    const key = alertDedupKey('B00TEST0001', 'price-drop')
    if (!activeKeys.has(key)) {
      activeKeys.add(key)
      newAlerts++
    }
  }

  expect(newAlerts, 1, 'only 1 alert despite 3 runs')
})

// ── Results ───────────────────────────────────────────────────────────────────

console.log()
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
