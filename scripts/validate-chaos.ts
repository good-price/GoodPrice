/**
 * scripts/validate-chaos.ts
 *
 * Sprint 5C — Chaos Test Engine.
 *
 * Tests fault tolerance by temporarily removing, corrupting, or emptying
 * store files, then verifying every reader returns safe defaults — never throws.
 *
 * ⚠️  All file mutations are wrapped in try/finally to restore original state.
 * The system will be in the EXACT same state after this script as before.
 *
 * Run: npx tsx --tsconfig tsconfig.scripts.json scripts/validate-chaos.ts
 */

import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
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

function fp(rel: string): string {
  return path.join(ROOT, rel)
}

// ── File mutation helpers ─────────────────────────────────────────────────────

function withRemovedFile(relPath: string, fn: () => void): void {
  const target  = fp(relPath)
  const backup  = target + '.chaos-bak'
  const existed = existsSync(target)
  if (existed) renameSync(target, backup)
  try {
    fn()
  } finally {
    if (existed && existsSync(backup)) renameSync(backup, target)
  }
}

function withCorruptedFile(relPath: string, fn: () => void): void {
  const target  = fp(relPath)
  const backup  = target + '.chaos-bak'
  const existed = existsSync(target)
  if (existed) renameSync(target, backup)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, '{ bad json }!@#', 'utf-8')
  try {
    fn()
  } finally {
    if (existsSync(target)) unlinkSync(target)
    if (existed && existsSync(backup)) renameSync(backup, target)
  }
}

function withEmptyFile(relPath: string, fn: () => void): void {
  const target  = fp(relPath)
  const backup  = target + '.chaos-bak'
  const existed = existsSync(target)
  if (existed) renameSync(target, backup)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, '', 'utf-8')
  try {
    fn()
  } finally {
    if (existsSync(target)) unlinkSync(target)
    if (existed && existsSync(backup)) renameSync(backup, target)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ── CHAOS 1: Missing critical files → safe defaults, zero crashes ───────────

  section('CHAOS 1: Missing files → safe defaults, 0 crashes')

  await testAsync('runtime catalog missing (primary + backup) → empty store', async () => {
    const { readRuntimeCatalog } = await import('../lib/catalog/runtime/reader')
    withRemovedFile('data/catalog/runtime-catalog.json', () => {
      withRemovedFile('data/catalog/runtime-catalog.backup.json', () => {
        const store = readRuntimeCatalog()
        if (!Array.isArray(store.products))     throw new Error('products must be array')
        if (store.products.length !== 0)        throw new Error('must have 0 products when both files absent')
      })
    })
  })

  await testAsync('lifecycle.json missing → empty products map', async () => {
    const { readLifecycleStore } = await import('../lib/catalog/lifecycle/state')
    withRemovedFile('data/catalog/lifecycle.json', () => {
      const store = readLifecycleStore()
      if (typeof store.products !== 'object') throw new Error('must return products object')
      if (Object.keys(store.products).length !== 0) throw new Error('must be empty map on missing file')
    })
  })

  await testAsync('recommendations.json missing → empty products map', async () => {
    const { readRecommendations } = await import('../lib/catalog/recommendations/state')
    withRemovedFile('data/catalog/recommendations.json', () => {
      const store = readRecommendations()
      if (typeof store.products !== 'object') throw new Error('must return products object')
    })
  })

  await testAsync('alerts.json missing → empty alerts map', async () => {
    const { readAlerts } = await import('../lib/catalog/alerts/state')
    withRemovedFile('data/catalog/alerts.json', () => {
      const store = readAlerts()
      if (typeof store.alerts !== 'object') throw new Error('must return alerts object')
    })
  })

  await testAsync('price-history.json missing → empty products map', async () => {
    const { readPriceHistory } = await import('../lib/catalog/pricing-memory/state')
    withRemovedFile('data/catalog/price-history.json', () => {
      const store = readPriceHistory()
      if (typeof store.products !== 'object') throw new Error('must return products object')
    })
  })

  await testAsync('product-intelligence.json missing → empty products map', async () => {
    const { readProductIntelligence } = await import('../lib/catalog/pricing-memory/state')
    withRemovedFile('data/catalog/product-intelligence.json', () => {
      const store = readProductIntelligence()
      if (typeof store.products !== 'object') throw new Error('must return products object')
    })
  })

  await testAsync('discovery-state.json missing → default state', async () => {
    const { readDiscoveryState } = await import('../lib/catalog/discovery/state')
    withRemovedFile('data/catalog/discovery-state.json', () => {
      const state = readDiscoveryState()
      if (typeof state.categories !== 'object') throw new Error('must return categories object')
    })
  })

  await testAsync('all stores missing → getProductIntelligence returns emptyIntelligence', async () => {
    const { getProductIntelligence } = await import('../lib/catalog/product-intelligence/reader')
    withRemovedFile('data/catalog/recommendations.json', () => {
      withRemovedFile('data/catalog/alerts.json', () => {
        withRemovedFile('data/catalog/product-intelligence.json', () => {
          withRemovedFile('data/catalog/lifecycle.json', () => {
            const intel = getProductIntelligence('B00SFSU53G')
            if (intel.recommendationScore !== 0) throw new Error('expected 0 score on all stores missing')
            if (intel.badges.length !== 0)       throw new Error('expected 0 badges')
            if (intel.alerts.length !== 0)       throw new Error('expected 0 alerts')
          })
        })
      })
    })
  })

  // ── CHAOS 2: Corrupted JSON → safe defaults, zero crashes ──────────────────

  section('CHAOS 2: Corrupted JSON → safe defaults, 0 crashes')

  await testAsync('corrupt runtime-catalog.json → falls back to backup or empty', async () => {
    const { readRuntimeCatalog } = await import('../lib/catalog/runtime/reader')
    withCorruptedFile('data/catalog/runtime-catalog.json', () => {
      const store = readRuntimeCatalog()
      if (!Array.isArray(store.products)) throw new Error('must return array on corrupt primary')
    })
  })

  await testAsync('corrupt lifecycle.json → empty store, no throw', async () => {
    const { readLifecycleStore } = await import('../lib/catalog/lifecycle/state')
    withCorruptedFile('data/catalog/lifecycle.json', () => {
      const store = readLifecycleStore()
      if (typeof store.products !== 'object') throw new Error('must return safe default')
    })
  })

  await testAsync('corrupt recommendations.json → empty store, no throw', async () => {
    const { readRecommendations } = await import('../lib/catalog/recommendations/state')
    withCorruptedFile('data/catalog/recommendations.json', () => {
      const store = readRecommendations()
      if (typeof store.products !== 'object') throw new Error('must return safe default')
    })
  })

  await testAsync('corrupt alerts.json → empty store, no throw', async () => {
    const { readAlerts } = await import('../lib/catalog/alerts/state')
    withCorruptedFile('data/catalog/alerts.json', () => {
      const store = readAlerts()
      if (typeof store.alerts !== 'object') throw new Error('must return safe default')
    })
  })

  await testAsync('corrupt price-history.json → empty store, no throw', async () => {
    const { readPriceHistory } = await import('../lib/catalog/pricing-memory/state')
    withCorruptedFile('data/catalog/price-history.json', () => {
      const store = readPriceHistory()
      if (typeof store.products !== 'object') throw new Error('must return safe default')
    })
  })

  await testAsync('corrupt product-intelligence.json → empty store, no throw', async () => {
    const { readProductIntelligence } = await import('../lib/catalog/pricing-memory/state')
    withCorruptedFile('data/catalog/product-intelligence.json', () => {
      const store = readProductIntelligence()
      if (typeof store.products !== 'object') throw new Error('must return safe default')
    })
  })

  // ── CHAOS 3: Empty files → safe defaults, zero crashes ─────────────────────

  section('CHAOS 3: Empty files → safe defaults, 0 crashes')

  await testAsync('empty lifecycle.json → safe default', async () => {
    const { readLifecycleStore } = await import('../lib/catalog/lifecycle/state')
    withEmptyFile('data/catalog/lifecycle.json', () => {
      const store = readLifecycleStore()
      if (typeof store.products !== 'object') throw new Error('must return safe default')
    })
  })

  await testAsync('empty recommendations.json → safe default', async () => {
    const { readRecommendations } = await import('../lib/catalog/recommendations/state')
    withEmptyFile('data/catalog/recommendations.json', () => {
      const store = readRecommendations()
      if (typeof store.products !== 'object') throw new Error('must return safe default')
    })
  })

  await testAsync('empty alerts.json → safe default', async () => {
    const { readAlerts } = await import('../lib/catalog/alerts/state')
    withEmptyFile('data/catalog/alerts.json', () => {
      const store = readAlerts()
      if (typeof store.alerts !== 'object') throw new Error('must return safe default')
    })
  })

  await testAsync('empty price-history.json → safe default', async () => {
    const { readPriceHistory } = await import('../lib/catalog/pricing-memory/state')
    withEmptyFile('data/catalog/price-history.json', () => {
      const store = readPriceHistory()
      if (typeof store.products !== 'object') throw new Error('must return safe default')
    })
  })

  // ── CHAOS 4: Simultaneous read during controlled file operations ────────────

  section('CHAOS 4: Reader behavior during file operations')

  await testAsync('getProductIntelligence during corrupt recommendations → emptyIntelligence, no throw', async () => {
    const { getProductIntelligence } = await import('../lib/catalog/product-intelligence/reader')
    withCorruptedFile('data/catalog/recommendations.json', () => {
      const intel = getProductIntelligence('B00SFSU53G')
      if (typeof intel.recommendationScore !== 'number') throw new Error('must return number')
      if (!Array.isArray(intel.badges)) throw new Error('must return array')
    })
  })

  await testAsync('getRelatedProducts with corrupt runtime catalog → empty array, no throw', async () => {
    const { getRelatedProducts } = await import('../lib/catalog/similarity/index')
    withCorruptedFile('data/catalog/runtime-catalog.json', () => {
      withCorruptedFile('data/catalog/runtime-catalog.backup.json', () => {
        const result = getRelatedProducts('B00SFSU53G', 'electronica', 4)
        if (!Array.isArray(result)) throw new Error('must return array')
      })
    })
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
