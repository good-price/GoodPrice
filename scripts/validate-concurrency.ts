/**
 * scripts/validate-concurrency.ts
 *
 * Sprint 5C — Concurrency Test Engine.
 *
 * Tests lock/idempotency guarantees and reader consistency under simultaneous
 * access. Does NOT trigger real Amazon HTTP calls.
 *
 * Run: npx tsx --tsconfig tsconfig.scripts.json scripts/validate-concurrency.ts
 */

import { existsSync, readFileSync } from 'fs'
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

function section(title: string): void {
  console.log(`\n${title}`)
}

async function main(): Promise<void> {
  // ── TEST 1: Catalog fill lock mechanism ─────────────────────────────────────

  section('TEST 1: Catalog fill lock (isRunning guard)')

  await testAsync('catalog-execution.json isRunning is a boolean', async () => {
    const fp = path.join(ROOT, 'data/catalog/catalog-execution.json')
    if (!existsSync(fp)) return // File absent = never ran = no lock held
    const raw = JSON.parse(readFileSync(fp, 'utf-8')) as Record<string, unknown>
    if (typeof raw['isRunning'] !== 'boolean')
      throw new Error(`isRunning must be boolean, got ${typeof raw['isRunning']}`)
  })

  await testAsync('isRunning=true ↔ pipelineId non-null (no crash state)', async () => {
    const fp = path.join(ROOT, 'data/catalog/catalog-execution.json')
    if (!existsSync(fp)) return
    const raw = JSON.parse(readFileSync(fp, 'utf-8')) as Record<string, unknown>
    if (raw['isRunning'] === true && (raw['pipelineId'] === null || raw['pipelineId'] === undefined))
      throw new Error('isRunning=true but pipelineId=null — stale lock from crash')
  })

  await testAsync('master-cycle-state.json isRunning=false in idle state', async () => {
    const fp = path.join(ROOT, 'data/ops/runtime/master-cycle-state.json')
    if (!existsSync(fp)) return
    const raw = JSON.parse(readFileSync(fp, 'utf-8')) as Record<string, unknown>
    if (raw['isRunning'] === true)
      throw new Error('master-cycle-state isRunning=true — stale lock from crash or active cycle')
  })

  await testAsync('readCatalogExecution() — 10 simultaneous reads, never throws', async () => {
    const { readCatalogExecution } = await import('../lib/catalog/runtime/execution-actions')
    const results = await Promise.all(
      Array.from({ length: 10 }, () => Promise.resolve().then(() => readCatalogExecution()))
    )
    for (const r of results) {
      if (typeof r !== 'object' || r === null)
        throw new Error('readCatalogExecution returned non-object')
      if (typeof (r as Record<string, unknown>)['isRunning'] !== 'boolean')
        throw new Error('missing isRunning field')
    }
  })

  // ── TEST 2: 50 simultaneous getProductIntelligence() calls ─────────────────

  section('TEST 2: 50 concurrent getProductIntelligence() — 0 errors, 0 inconsistencies')

  await testAsync('50 parallel getProductIntelligence(sampleAsin) — all valid, score consistent', async () => {
    const { getProductIntelligence } = await import('../lib/catalog/product-intelligence/reader')
    const sampleAsin = 'B00SFSU53G'
    const results    = await Promise.all(
      Array.from({ length: 50 }, () =>
        Promise.resolve().then(() => getProductIntelligence(sampleAsin))
      )
    )
    for (const r of results) {
      if (!r || typeof r.asin !== 'string')  throw new Error('invalid result')
      if (!Array.isArray(r.badges))           throw new Error('badges must be array')
      if (typeof r.recommendationScore !== 'number') throw new Error('score must be number')
    }
    const scores = results.map(r => r.recommendationScore)
    if (new Set(scores).size > 1)
      throw new Error(`inconsistent recommendationScore: ${[...new Set(scores)].join(', ')}`)
  })

  await testAsync('50 parallel getProductIntelligence(unknownAsin) — all return emptyIntelligence', async () => {
    const { getProductIntelligence } = await import('../lib/catalog/product-intelligence/reader')
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        Promise.resolve().then(() => getProductIntelligence('NOTEXIST00'))
      )
    )
    for (const r of results) {
      if (r.asin !== 'NOTEXIST00') throw new Error('asin must be preserved')
      if (r.recommendationScore !== 0) throw new Error('unknown ASIN must have score 0')
    }
  })

  // ── TEST 3: 50 simultaneous getRelatedProducts() calls ─────────────────────

  section('TEST 3: 50 concurrent getRelatedProducts() — 0 throws')

  await testAsync('50 parallel getRelatedProducts() — all return array, none throw', async () => {
    const { getRelatedProducts } = await import('../lib/catalog/similarity/index')
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        Promise.resolve().then(() => {
          try {
            return getRelatedProducts('B00SFSU53G', 'electronica', 4)
          } catch (e) {
            throw new Error(`getRelatedProducts threw: ${e}`)
          }
        })
      )
    )
    for (const r of results) {
      if (!Array.isArray(r)) throw new Error('must return array')
    }
  })

  // ── TEST 4: Runtime catalog consistency across 10 simultaneous reads ────────

  section('TEST 4: Store read consistency (10 simultaneous consumers)')

  await testAsync('readRuntimeCatalog() — consistent totalProducts across 10 reads', async () => {
    const { readRuntimeCatalog } = await import('../lib/catalog/runtime/reader')
    const results = await Promise.all(
      Array.from({ length: 10 }, () => Promise.resolve().then(() => readRuntimeCatalog()))
    )
    const totals = results.map(r => r.totalProducts)
    if (new Set(totals).size > 1)
      throw new Error(`inconsistent totalProducts: ${totals.join(', ')}`)
  })

  await testAsync('readLifecycleStore() — consistent across 10 reads', async () => {
    const { readLifecycleStore } = await import('../lib/catalog/lifecycle/state')
    const results = await Promise.all(
      Array.from({ length: 10 }, () => Promise.resolve().then(() => readLifecycleStore()))
    )
    const timestamps = results.map(r => r.updatedAt)
    if (new Set(timestamps).size > 1)
      throw new Error(`inconsistent updatedAt: ${[...new Set(timestamps)].join(', ')}`)
  })

  await testAsync('readRecommendations() — consistent across 10 reads', async () => {
    const { readRecommendations } = await import('../lib/catalog/recommendations/state')
    const results = await Promise.all(
      Array.from({ length: 10 }, () => Promise.resolve().then(() => readRecommendations()))
    )
    const timestamps = results.map(r => r.updatedAt)
    if (new Set(timestamps).size > 1)
      throw new Error(`inconsistent updatedAt: ${[...new Set(timestamps)].join(', ')}`)
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
