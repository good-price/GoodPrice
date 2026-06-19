/**
 * scripts/validate-scale.ts
 *
 * Sprint H1 — Scale and performance validation.
 *
 * Measures read latency and scan durations against targets.
 * Uses the actual live data stores — no synthetic data generation.
 *
 * Targets:
 *   readRuntimeCatalog()     median < 50ms
 *   getProductIntelligence() median < 100ms
 *   getRelatedProducts()     median < 50ms
 *   runLifecycleScan()       each < 1000ms
 *   runRecommendationScan()  each < 1000ms
 *   runAlertScan()           each < 1000ms
 *   runPricingScan()         each < 1000ms
 *
 * Run: npx tsx --tsconfig tsconfig.scripts.json scripts/validate-scale.ts
 */

import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'

const ROOT = process.cwd()
let passed = 0
let failed = 0
const results: Array<{
  name: string
  status: 'PASS' | 'FAIL'
  medianMs?: number
  maxMs?: number
  error?: string
}> = []

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`  ✅ ${name}`)
    passed++
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

function measureN(n: number, fn: () => void): { median: number; max: number; p95: number } {
  const times: number[] = []
  for (let i = 0; i < n; i++) {
    const start = performance.now()
    fn()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return {
    median: times[Math.floor(times.length / 2)],
    max:    times[times.length - 1],
    p95:    times[Math.floor(times.length * 0.95)],
  }
}

async function main(): Promise<void> {

  // ── SCALE 1: readRuntimeCatalog() latency ─────────────────────────────────

  section('SCALE 1: readRuntimeCatalog() — median < 50ms')

  await testAsync('50 sequential reads — median < 50ms', async () => {
    const { readRuntimeCatalog } = await import('../lib/catalog/runtime/reader')
    const { median, max, p95 } = measureN(50, () => readRuntimeCatalog())
    console.log(`     median=${median.toFixed(1)}ms  p95=${p95.toFixed(1)}ms  max=${max.toFixed(1)}ms`)
    results.push({ name: 'readRuntimeCatalog() × 50', status: median <= 50 ? 'PASS' : 'FAIL', medianMs: median, maxMs: max })
    if (median > 50) throw new Error(`median ${median.toFixed(1)}ms exceeds 50ms target`)
  })

  // ── SCALE 2: getProductIntelligence() latency ─────────────────────────────

  section('SCALE 2: getProductIntelligence() — median < 100ms')

  await testAsync('50 sequential calls — median < 100ms', async () => {
    const { getProductIntelligence } = await import('../lib/catalog/product-intelligence/reader')
    const asin = 'B00SFSU53G'
    const { median, max, p95 } = measureN(50, () => getProductIntelligence(asin))
    console.log(`     median=${median.toFixed(1)}ms  p95=${p95.toFixed(1)}ms  max=${max.toFixed(1)}ms`)
    results.push({ name: 'getProductIntelligence() × 50', status: median <= 100 ? 'PASS' : 'FAIL', medianMs: median, maxMs: max })
    if (median > 100) throw new Error(`median ${median.toFixed(1)}ms exceeds 100ms target`)
  })

  // ── SCALE 3: getRelatedProducts() latency ────────────────────────────────

  section('SCALE 3: getRelatedProducts() — median < 50ms')

  await testAsync('50 sequential calls — median < 50ms', async () => {
    const { getRelatedProducts } = await import('../lib/catalog/similarity/index')
    const { median, max, p95 } = measureN(50, () => getRelatedProducts('B00SFSU53G', 'electronica', 4))
    console.log(`     median=${median.toFixed(1)}ms  p95=${p95.toFixed(1)}ms  max=${max.toFixed(1)}ms`)
    results.push({ name: 'getRelatedProducts() × 50', status: median <= 50 ? 'PASS' : 'FAIL', medianMs: median, maxMs: max })
    if (median > 50) throw new Error(`median ${median.toFixed(1)}ms exceeds 50ms target`)
  })

  // ── SCALE 4: Scan durations ───────────────────────────────────────────────

  section('SCALE 4: Scan durations — each < 1000ms')

  await testAsync('runLifecycleScan() × 3 — each < 1000ms', async () => {
    const { runLifecycleScan } = await import('../lib/catalog/lifecycle/index')
    for (let i = 0; i < 3; i++) {
      const start = performance.now()
      runLifecycleScan()
      const ms = performance.now() - start
      console.log(`     run ${i + 1}: ${ms.toFixed(0)}ms`)
      if (ms > 1000) throw new Error(`run ${i + 1}: ${ms.toFixed(0)}ms exceeds 1000ms`)
    }
    results.push({ name: 'runLifecycleScan() × 3', status: 'PASS' })
  })

  await testAsync('runRecommendationScan() × 3 — each < 1000ms', async () => {
    const { runRecommendationScan } = await import('../lib/catalog/recommendations/index')
    for (let i = 0; i < 3; i++) {
      const start = performance.now()
      runRecommendationScan()
      const ms = performance.now() - start
      console.log(`     run ${i + 1}: ${ms.toFixed(0)}ms`)
      if (ms > 1000) throw new Error(`run ${i + 1}: ${ms.toFixed(0)}ms exceeds 1000ms`)
    }
    results.push({ name: 'runRecommendationScan() × 3', status: 'PASS' })
  })

  await testAsync('runAlertScan() × 3 — each < 1000ms', async () => {
    const { runAlertScan } = await import('../lib/catalog/alerts/index')
    for (let i = 0; i < 3; i++) {
      const start = performance.now()
      runAlertScan()
      const ms = performance.now() - start
      console.log(`     run ${i + 1}: ${ms.toFixed(0)}ms`)
      if (ms > 1000) throw new Error(`run ${i + 1}: ${ms.toFixed(0)}ms exceeds 1000ms`)
    }
    results.push({ name: 'runAlertScan() × 3', status: 'PASS' })
  })

  await testAsync('runPricingScan() × 3 — each < 1000ms', async () => {
    const { runPricingScan } = await import('../lib/catalog/pricing-memory/index')
    for (let i = 0; i < 3; i++) {
      const start = performance.now()
      runPricingScan()
      const ms = performance.now() - start
      console.log(`     run ${i + 1}: ${ms.toFixed(0)}ms`)
      if (ms > 1000) throw new Error(`run ${i + 1}: ${ms.toFixed(0)}ms exceeds 1000ms`)
    }
    results.push({ name: 'runPricingScan() × 3', status: 'PASS' })
  })

  // ── SCALE 5: Bulk parallel consistency ────────────────────────────────────

  section('SCALE 5: 100 parallel reads — consistent, 0 inconsistencies')

  await testAsync('100 parallel readRuntimeCatalog() — consistent totalProducts', async () => {
    const { readRuntimeCatalog } = await import('../lib/catalog/runtime/reader')
    const results = await Promise.all(
      Array.from({ length: 100 }, () => Promise.resolve().then(() => readRuntimeCatalog()))
    )
    const counts = results.map(r => r.totalProducts)
    if (new Set(counts).size > 1)
      throw new Error(`inconsistent totalProducts: ${[...new Set(counts)].join(', ')}`)
    console.log(`     all 100 reads → totalProducts=${counts[0]}`)
  })

  await testAsync('100 parallel getProductIntelligence() — consistent scores', async () => {
    const { getProductIntelligence } = await import('../lib/catalog/product-intelligence/reader')
    const asin = 'B00SFSU53G'
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        Promise.resolve().then(() => getProductIntelligence(asin))
      )
    )
    const scores = results.map(r => r.recommendationScore)
    if (new Set(scores).size > 1)
      throw new Error(`inconsistent score: ${[...new Set(scores)].join(', ')}`)
    console.log(`     all 100 reads → score=${scores[0]}`)
  })

  // ── Generate scale-report.json ────────────────────────────────────────────

  const reportDir  = path.join(ROOT, 'docs', 'reports')
  const reportPath = path.join(reportDir, 'scale-report.json')
  const report = {
    generatedAt: new Date().toISOString(),
    passed,
    failed,
    total:       passed + failed,
    status:      failed === 0 ? 'PASS' : 'FAIL',
    results,
  }

  try {
    mkdirSync(reportDir, { recursive: true })
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
    console.log(`\n  📄 scale-report.json saved`)
  } catch {
    console.error('  ⚠️  Could not save scale-report.json')
  }

  console.log()
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
