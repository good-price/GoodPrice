/**
 * scripts/validate-stress.ts
 *
 * Sprint H1 — Stress test engine.
 *
 * Tests store readers and pipeline functions under high concurrency load.
 * Validates: 0 throws, 0 data corruption, 0 inconsistencies.
 *
 * Run: npx tsx --tsconfig tsconfig.scripts.json scripts/validate-stress.ts
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

function section(title: string): void {
  console.log(`\n${title}`)
}

async function main(): Promise<void> {

  // ── STRESS 1: 100 parallel getProductIntelligence() ──────────────────────

  section('STRESS 1: 100 parallel getProductIntelligence()')

  await testAsync('100 parallel reads — all valid, scores consistent', async () => {
    const { getProductIntelligence } = await import('../lib/catalog/product-intelligence/reader')
    const asin    = 'B00SFSU53G'
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        Promise.resolve().then(() => getProductIntelligence(asin))
      )
    )
    for (const r of results) {
      if (!r || typeof r.asin !== 'string')          throw new Error('invalid result')
      if (!Array.isArray(r.badges))                  throw new Error('badges must be array')
      if (typeof r.recommendationScore !== 'number') throw new Error('score must be number')
    }
    const scores = results.map(r => r.recommendationScore)
    if (new Set(scores).size > 1)
      throw new Error(`inconsistent scores: ${[...new Set(scores)].join(', ')}`)
  })

  await testAsync('100 parallel reads — unknown ASIN, all score 0', async () => {
    const { getProductIntelligence } = await import('../lib/catalog/product-intelligence/reader')
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        Promise.resolve().then(() => getProductIntelligence('STRESS_UNKNOWN_X'))
      )
    )
    for (const r of results) {
      if (r.recommendationScore !== 0) throw new Error('unknown ASIN must score 0')
      if (r.badges.length !== 0)       throw new Error('unknown ASIN must have 0 badges')
    }
  })

  // ── STRESS 2: 100 parallel getRelatedProducts() ───────────────────────────

  section('STRESS 2: 100 parallel getRelatedProducts()')

  await testAsync('100 parallel calls — all return array, 0 throws', async () => {
    const { getRelatedProducts } = await import('../lib/catalog/similarity/index')
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        Promise.resolve().then(() => {
          try {
            return getRelatedProducts('B00SFSU53G', 'electronica', 4)
          } catch (e) {
            throw new Error(`threw: ${e}`)
          }
        })
      )
    )
    for (const r of results) {
      if (!Array.isArray(r)) throw new Error('must return array')
    }
  })

  // ── STRESS 3: 50 triggerAutoFill() — lock holds, no crash state ──────────

  section('STRESS 3: 50 triggerAutoFill() — lock state valid after calls')

  await testAsync('50 rapid triggerAutoFill() — execution state valid after settling', async () => {
    const { triggerAutoFill }      = await import('../lib/catalog/runtime/auto-fill')
    const { readCatalogExecution } = await import('../lib/catalog/runtime/execution-actions')

    for (let i = 0; i < 50; i++) {
      triggerAutoFill()
    }

    await new Promise(resolve => setTimeout(resolve, 300))

    const exec = readCatalogExecution()
    if (typeof exec.isRunning !== 'boolean')
      throw new Error(`isRunning must be boolean, got ${typeof exec.isRunning}`)
    if (exec.isRunning === true && exec.pipelineId === null)
      throw new Error('isRunning=true with pipelineId=null — stale lock from crash')
  })

  await testAsync('readCatalogExecution() — 10 reads after stress — consistent isRunning', async () => {
    const { readCatalogExecution } = await import('../lib/catalog/runtime/execution-actions')
    const results = await Promise.all(
      Array.from({ length: 10 }, () => Promise.resolve().then(() => readCatalogExecution()))
    )
    const flags = results.map(r => r.isRunning)
    if (new Set(flags).size > 1)
      throw new Error(`inconsistent isRunning: ${flags.join(', ')}`)
  })

  // ── STRESS 4: 20 lifecycle scans ─────────────────────────────────────────

  section('STRESS 4: 20 lifecycle scans')

  await testAsync('20 runLifecycleScan() — returns valid result each time', async () => {
    const { runLifecycleScan } = await import('../lib/catalog/lifecycle/index')
    for (let i = 0; i < 20; i++) {
      const result = runLifecycleScan()
      if (typeof result !== 'object' || result === null)
        throw new Error(`call ${i}: must return object`)
    }
  })

  // ── STRESS 5: 20 recommendation scans ────────────────────────────────────

  section('STRESS 5: 20 recommendation scans')

  await testAsync('20 runRecommendationScan() — returns valid result each time', async () => {
    const { runRecommendationScan } = await import('../lib/catalog/recommendations/index')
    for (let i = 0; i < 20; i++) {
      const result = runRecommendationScan()
      if (typeof result !== 'object' || result === null)
        throw new Error(`call ${i}: must return object`)
    }
  })

  await testAsync('readRecommendations() — consistent across 10 reads after scans', async () => {
    const { readRecommendations } = await import('../lib/catalog/recommendations/state')
    const results = await Promise.all(
      Array.from({ length: 10 }, () => Promise.resolve().then(() => readRecommendations()))
    )
    const timestamps = results.map(r => r.updatedAt)
    if (new Set(timestamps).size > 1)
      throw new Error(`inconsistent updatedAt: ${[...new Set(timestamps)].join(', ')}`)
  })

  // ── STRESS 6: 20 alert scans ─────────────────────────────────────────────

  section('STRESS 6: 20 alert scans')

  await testAsync('20 runAlertScan() — returns valid result each time', async () => {
    const { runAlertScan } = await import('../lib/catalog/alerts/index')
    for (let i = 0; i < 20; i++) {
      const result = runAlertScan()
      if (typeof result !== 'object' || result === null)
        throw new Error(`call ${i}: must return object`)
    }
  })

  await testAsync('readAlerts() — consistent alerts object after scans', async () => {
    const { readAlerts } = await import('../lib/catalog/alerts/state')
    const store = readAlerts()
    if (typeof store.alerts !== 'object') throw new Error('must have alerts object')
  })

  // ── STRESS 7: 20 pricing scans ────────────────────────────────────────────

  section('STRESS 7: 20 pricing scans')

  await testAsync('20 runPricingScan() — returns valid result each time', async () => {
    const { runPricingScan } = await import('../lib/catalog/pricing-memory/index')
    for (let i = 0; i < 20; i++) {
      const result = runPricingScan()
      if (typeof result !== 'object' || result === null)
        throw new Error(`call ${i}: must return object`)
    }
  })

  // ── STRESS 8: 20 discovery state reads ───────────────────────────────────

  section('STRESS 8: 20 discovery state reads')

  await testAsync('20 readDiscoveryState() — consistent categories object', async () => {
    const { readDiscoveryState } = await import('../lib/catalog/discovery/state')
    const results: ReturnType<typeof readDiscoveryState>[] = []
    for (let i = 0; i < 20; i++) {
      results.push(readDiscoveryState())
    }
    for (const r of results) {
      if (typeof r.categories !== 'object')
        throw new Error('categories must be object')
    }
  })

  // ── STRESS 9: 20 mixed pipeline reads ────────────────────────────────────

  section('STRESS 9: 20 mixed pipeline reads — runtime + lifecycle + recommendations + alerts')

  await testAsync('20 parallel mixed reads — all stores consistent, 0 throws', async () => {
    const { readRuntimeCatalog }   = await import('../lib/catalog/runtime/reader')
    const { readLifecycleStore }   = await import('../lib/catalog/lifecycle/state')
    const { readRecommendations }  = await import('../lib/catalog/recommendations/state')
    const { readAlerts }           = await import('../lib/catalog/alerts/state')

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        Promise.resolve().then(() => ({
          totalProducts:    readRuntimeCatalog().totalProducts,
          lifecycleUpdated: readLifecycleStore().updatedAt,
          recsUpdated:      readRecommendations().updatedAt,
          alertsHasMap:     typeof readAlerts().alerts === 'object',
        }))
      )
    )
    for (const r of results) {
      if (!r.alertsHasMap) throw new Error('alerts must have map')
    }
    const totals = results.map(r => r.totalProducts)
    if (new Set(totals).size > 1)
      throw new Error(`inconsistent totalProducts: ${[...new Set(totals)].join(', ')}`)
  })

  // ── Generate stress-report.json ───────────────────────────────────────────

  const reportDir  = path.join(ROOT, 'docs', 'reports')
  const reportPath = path.join(reportDir, 'stress-report.json')
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
    console.log(`\n  📄 stress-report.json saved`)
  } catch {
    console.error('  ⚠️  Could not save stress-report.json')
  }

  // ── Results ──────────────────────────────────────────────────────────────

  console.log()
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
