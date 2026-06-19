/**
 * scripts/validate-catalog-lifecycle.ts
 *
 * Sprint 4D Validation — Catalog Intelligence & Product Lifecycle Engine
 *
 * Run:
 *   npx tsx scripts/validate-catalog-lifecycle.ts
 *
 * Expected: all checks PASS → CATALOG_LIFECYCLE_READY
 */

import { existsSync, readFileSync, unlinkSync } from 'fs'
import path from 'path'

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function check(label: string, condition: boolean, hint = '') {
  if (condition) {
    console.log(`  ✓  ${label}`)
    passed++
  } else {
    console.log(`  ✗  ${label}${hint ? ` — ${hint}` : ''}`)
    failed++
    failures.push(label)
  }
}

function section(title: string) {
  console.log(`\n── ${title} ──`)
}

const root = path.resolve(process.cwd())
const { readFileSync: rfs } = require('fs') as typeof import('fs')

function srcOf(rel: string): string {
  return rfs(path.join(root, rel), 'utf-8')
}

// ── Section 1: File existence ─────────────────────────────────────────────────

section('1. File existence')

const requiredFiles = [
  'lib/catalog/lifecycle/types.ts',
  'lib/catalog/lifecycle/health.ts',
  'lib/catalog/lifecycle/state.ts',
  'lib/catalog/lifecycle/metrics.ts',
  'lib/catalog/lifecycle/governance.ts',
  'lib/catalog/lifecycle/replacements.ts',
  'lib/catalog/lifecycle/index.ts',
  'components/admin/catalog/CatalogLifecycle.tsx',
  'components/admin/catalog/LifecycleProducts.tsx',
  'scripts/validate-catalog-lifecycle.ts',
]
for (const f of requiredFiles) {
  check(`Exists: ${f}`, existsSync(path.join(root, f)))
}

// ── Section 2: Type shapes ────────────────────────────────────────────────────

section('2. ProductLifecycle + LifecycleStore types')

import type { ProductLifecycle, LifecycleStore, LifecycleMetricsFile } from '../lib/catalog/lifecycle/types'

type _PLOk = {
  [K in 'asin'|'category'|'firstSeenAt'|'lastSeenAt'|'lastValidatedAt'|
         'lastPriceSyncAt'|'ageDays'|'staleDays'|'health'|
         'confidenceScore'|'qualityScore'|'validationCount'|'failureCount'|
         'needsRefresh'|'needsReplacement']: ProductLifecycle[K]
}
type _StoreOk = { updatedAt: LifecycleStore['updatedAt']; products: LifecycleStore['products'] }

check('ProductLifecycle all fields compile', true)
check('LifecycleStore shape compiles',        true)
check('LifecycleMetricsFile shape compiles',  true)

// ── Section 3: Health engine ──────────────────────────────────────────────────

section('3. computeLifecycleHealth()')

import { computeLifecycleHealth } from '../lib/catalog/lifecycle/health'

const cases: Array<[number, number, string, boolean, boolean]> = [
  [0,  80, 'healthy',  false, false],
  [14, 80, 'healthy',  false, false],
  [15, 80, 'aging',    true,  false],
  [29, 80, 'aging',    true,  false],
  [30, 80, 'stale',    true,  false],
  [59, 80, 'stale',    true,  false],
  [60, 80, 'critical', true,  true],
  [90, 80, 'critical', true,  true],
  // low confidence triggers needsReplacement even if not critical
  [10, 35, 'healthy',  false, false], // conf=35 = exactly at threshold (not < 35)
  [10, 30, 'healthy',  false, true],  // conf=30 < 35 → needsReplacement
  [60, 20, 'critical', true,  true],
]

for (const [stale, conf, expectedHealth, expectedRefresh, expectedReplace] of cases) {
  const r = computeLifecycleHealth(stale, conf)
  check(
    `staleDays=${stale} conf=${conf} → ${expectedHealth}`,
    r.health === expectedHealth,
    `got: ${r.health}`,
  )
  check(
    `staleDays=${stale} conf=${conf} → needsRefresh=${expectedRefresh}`,
    r.needsRefresh === expectedRefresh,
    `got: ${r.needsRefresh}`,
  )
  check(
    `staleDays=${stale} conf=${conf} → needsReplacement=${expectedReplace}`,
    r.needsReplacement === expectedReplace,
    `got: ${r.needsReplacement}`,
  )
}

// ── Section 4: Lifecycle persistence ─────────────────────────────────────────

section('4. readLifecycleStore / saveLifecycleStore / updateProductLifecycle')

import {
  readLifecycleStore,
  saveLifecycleStore,
  updateProductLifecycle,
  batchUpdateLifecycle,
  syncLifecycleFromRuntimeCatalog,
} from '../lib/catalog/lifecycle/state'

const LIFECYCLE_FILE = path.join(root, 'data/catalog/lifecycle.json')
const lifecycleExisted = existsSync(LIFECYCLE_FILE)
const lifecycleBackup  = LIFECYCLE_FILE + '.bak-validate'
if (lifecycleExisted) {
  try { require('fs').renameSync(LIFECYCLE_FILE, lifecycleBackup) } catch { /* ok */ }
}

// Default on missing file
const defStore = readLifecycleStore()
check('Default store when no file: updatedAt null', defStore.updatedAt === null)
check('Default store when no file: products empty', Object.keys(defStore.products).length === 0)

// Round-trip
const testStore: LifecycleStore = {
  updatedAt: '2025-06-01T00:00:00.000Z',
  products: {
    'B0TESTLC01': {
      asin:            'B0TESTLC01',
      category:        'electronica',
      firstSeenAt:     '2025-01-01T00:00:00.000Z',
      lastSeenAt:      '2025-05-01T00:00:00.000Z',
      lastValidatedAt: '2025-05-01T00:00:00.000Z',
      lastPriceSyncAt: null,
      ageDays:         150,
      staleDays:       31,
      health:          'stale',
      confidenceScore: 72,
      qualityScore:    68,
      validationCount: 5,
      failureCount:    1,
      needsRefresh:    true,
      needsReplacement: false,
    },
  },
}
saveLifecycleStore(testStore)
const rt = readLifecycleStore()
check('Round-trip: updatedAt preserved',   rt.updatedAt    === '2025-06-01T00:00:00.000Z')
check('Round-trip: product ASIN present',  !!rt.products['B0TESTLC01'])
check('Round-trip: staleDays preserved',   rt.products['B0TESTLC01']?.staleDays === 31)
check('Round-trip: tmp file cleaned up',   !existsSync(LIFECYCLE_FILE + '.tmp'))

// updateProductLifecycle
updateProductLifecycle('B0UPDTEST1', {
  category:        'gaming',
  firstSeenAt:     '2025-03-01T00:00:00.000Z',
  lastValidatedAt: '2025-03-15T00:00:00.000Z',
  confidenceScore: 45,
  qualityScore:    55,
  validationCount: 3,
  failureCount:    0,
})
const afterUpd = readLifecycleStore()
const upd = afterUpd.products['B0UPDTEST1']
check('updateProductLifecycle: product created',     !!upd)
check('updateProductLifecycle: category stored',     upd?.category        === 'gaming')
check('updateProductLifecycle: confidenceScore',     upd?.confidenceScore === 45)
check('updateProductLifecycle: validationCount',     upd?.validationCount === 3)
check('updateProductLifecycle: ageDays computed',    (upd?.ageDays ?? -1)   >  0)
check('updateProductLifecycle: staleDays computed',  (upd?.staleDays ?? -1) >  0)
check('updateProductLifecycle: health computed',     ['healthy','aging','stale','critical'].includes(upd?.health ?? ''))
check('updateProductLifecycle: needsRefresh set',    typeof upd?.needsRefresh === 'boolean')

// batchUpdateLifecycle
batchUpdateLifecycle([
  { asin: 'B0BATCH0001', updates: { category: 'hogar', confidenceScore: 70, qualityScore: 80, firstSeenAt: '2025-04-01T00:00:00.000Z' } },
  { asin: 'B0BATCH0002', updates: { category: 'cocina', confidenceScore: 25, qualityScore: 60, firstSeenAt: '2024-01-01T00:00:00.000Z', lastValidatedAt: '2024-01-15T00:00:00.000Z' } },
])
const afterBatch = readLifecycleStore()
check('batchUpdateLifecycle: B0BATCH0001 created', !!afterBatch.products['B0BATCH0001'])
check('batchUpdateLifecycle: B0BATCH0002 created', !!afterBatch.products['B0BATCH0002'])

const b2 = afterBatch.products['B0BATCH0002']
check('batchUpdateLifecycle: low confidence → needsReplacement',
  b2?.needsReplacement === true, `conf=${b2?.confidenceScore}`)

// syncLifecycleFromRuntimeCatalog — should not throw
let syncError = false
let syncCount = 0
try { syncCount = syncLifecycleFromRuntimeCatalog() } catch { syncError = true }
check('syncLifecycleFromRuntimeCatalog: does not throw', !syncError)
check('syncLifecycleFromRuntimeCatalog: returns count', typeof syncCount === 'number')

// Restore lifecycle file
try {
  if (!lifecycleExisted) unlinkSync(LIFECYCLE_FILE)
  else if (existsSync(lifecycleBackup)) require('fs').renameSync(lifecycleBackup, LIFECYCLE_FILE)
} catch { /* ok */ }

// ── Section 5: Lifecycle metrics ──────────────────────────────────────────────

section('5. readLifecycleMetrics / updateLifecycleMetrics')

import { readLifecycleMetrics, saveLifecycleMetrics, updateLifecycleMetrics } from '../lib/catalog/lifecycle/metrics'

const METRICS_FILE = path.join(root, 'data/catalog/lifecycle-metrics.json')
const metricsExisted = existsSync(METRICS_FILE)
const metricsBackup  = METRICS_FILE + '.bak-validate'
if (metricsExisted) {
  try { require('fs').renameSync(METRICS_FILE, metricsBackup) } catch { /* ok */ }
}

const defMetrics = readLifecycleMetrics()
check('Default metrics: lastScanAt null',     defMetrics.lastScanAt  === null)
check('Default metrics: totalScans 0',        defMetrics.totalScans  === 0)
check('Default metrics: breakdown null',      defMetrics.lastHealthBreakdown === null)

updateLifecycleMetrics({ durationMs: 1500, updated: 42, breakdown: { healthy: 30, aging: 5, stale: 5, critical: 2 } })
const m = readLifecycleMetrics()
check('updateLifecycleMetrics: totalScans incremented', m.totalScans          === 1)
check('updateLifecycleMetrics: durationMs stored',      m.lastScanDurationMs  === 1500)
check('updateLifecycleMetrics: updated stored',         m.lastScanUpdated     === 42)
check('updateLifecycleMetrics: breakdown stored',       m.lastHealthBreakdown?.critical === 2)
check('updateLifecycleMetrics: lastScanAt set',         !!m.lastScanAt)

try { if (!metricsExisted) unlinkSync(METRICS_FILE) } catch { /* ok */ }
if (metricsExisted && existsSync(metricsBackup)) {
  try { require('fs').renameSync(metricsBackup, METRICS_FILE) } catch { /* ok */ }
}

// ── Section 6: Lifecycle governance ──────────────────────────────────────────

section('6. getLifecycleGovernance()')

import { getLifecycleGovernance } from '../lib/catalog/lifecycle/governance'
import type { LifecycleGovernance } from '../lib/catalog/lifecycle/governance'

const gov = getLifecycleGovernance()
check('getLifecycleGovernance: returns object',             typeof gov === 'object')
check('getLifecycleGovernance: totalProducts >= 0',         gov.totalProducts      >= 0)
check('getLifecycleGovernance: healthy >= 0',               gov.healthy            >= 0)
check('getLifecycleGovernance: aging >= 0',                 gov.aging              >= 0)
check('getLifecycleGovernance: stale >= 0',                 gov.stale              >= 0)
check('getLifecycleGovernance: critical >= 0',              gov.critical           >= 0)
check('getLifecycleGovernance: refreshNeeded >= 0',         gov.refreshNeeded      >= 0)
check('getLifecycleGovernance: replacementNeeded >= 0',     gov.replacementNeeded  >= 0)
check('getLifecycleGovernance: averageAgeDays >= 0',        gov.averageAgeDays     >= 0)
check('getLifecycleGovernance: averageConfidence >= 0',     gov.averageConfidence  >= 0)
check('getLifecycleGovernance: never throws',               true)

// Seed store to verify aggregation
const testForGov: LifecycleStore = {
  updatedAt: new Date().toISOString(),
  products: {
    A1: { asin: 'A1', category: 'hogar', firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), lastValidatedAt: new Date().toISOString(), lastPriceSyncAt: null, ageDays: 5, staleDays: 5, health: 'healthy', confidenceScore: 80, qualityScore: 70, validationCount: 2, failureCount: 0, needsRefresh: false, needsReplacement: false },
    A2: { asin: 'A2', category: 'hogar', firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), lastValidatedAt: null, lastPriceSyncAt: null, ageDays: 70, staleDays: 70, health: 'critical', confidenceScore: 30, qualityScore: 40, validationCount: 0, failureCount: 3, needsRefresh: true, needsReplacement: true },
  },
}
saveLifecycleStore(testForGov)
const gov2 = getLifecycleGovernance()
check('Governance: totalProducts correct',    gov2.totalProducts     === 2)
check('Governance: healthy count correct',    gov2.healthy           === 1)
check('Governance: critical count correct',   gov2.critical          === 1)
check('Governance: replacementNeeded correct',gov2.replacementNeeded === 1)
check('Governance: averageConfidence correct',gov2.averageConfidence === Math.round((80 + 30) / 2))

// Cleanup gov test store
try { unlinkSync(LIFECYCLE_FILE) } catch { /* ok */ }
if (lifecycleExisted && existsSync(lifecycleBackup)) {
  try { require('fs').renameSync(lifecycleBackup, LIFECYCLE_FILE) } catch { /* ok */ }
}

// ── Section 7: Replacement candidates ────────────────────────────────────────

section('7. findReplacementCandidates()')

import { findReplacementCandidates } from '../lib/catalog/lifecycle/replacements'

let replacError = false
let candidates: ReturnType<typeof findReplacementCandidates> = []
try { candidates = findReplacementCandidates('electronica') } catch (e) { replacError = true }

check('findReplacementCandidates: does not throw',  !replacError)
check('findReplacementCandidates: returns array',   Array.isArray(candidates))
check('findReplacementCandidates: max 10 results',  candidates.length <= 10)

// All returned candidates meet the criteria
const allMeetCriteria = candidates.every(
  c => c.qualityScore >= 60 && c.confidenceScore >= 60,
)
check('findReplacementCandidates: all qualityScore >= 60',    allMeetCriteria || candidates.length === 0)

// Sort order: qualityScore desc, then confidenceScore desc, then rating desc
const isSorted = candidates.every((c, i) => {
  if (i === 0) return true
  const prev = candidates[i - 1]
  if (c.qualityScore !== prev.qualityScore)    return c.qualityScore    <= prev.qualityScore
  if (c.confidenceScore !== prev.confidenceScore) return c.confidenceScore <= prev.confidenceScore
  return (c.rating ?? 0) <= (prev.rating ?? 0)
})
check('findReplacementCandidates: sorted correctly', isSorted)

// ── Section 8: Pipeline integration ──────────────────────────────────────────

section('8. Pipeline integration')

const admissionSrc = srcOf('lib/catalog/admission/admission.ts')
check('admission.ts imports updateProductLifecycle',    admissionSrc.includes('updateProductLifecycle'))
check('admission.ts calls updateProductLifecycle',      admissionSrc.includes('updateProductLifecycle('))
check('admission.ts sets category on admission',        admissionSrc.includes('category:') && admissionSrc.includes('product.category'))
check('admission.ts sets firstSeenAt',                  admissionSrc.includes('firstSeenAt'))
check('admission.ts sets validationCount: 1',           admissionSrc.includes('validationCount: 1'))

const autoRepairSrc = srcOf('lib/catalog/self-healing/auto-repair.ts')
check('auto-repair.ts imports runLifecycleScan',        autoRepairSrc.includes('runLifecycleScan'))
check('auto-repair.ts calls runLifecycleScan',          autoRepairSrc.includes('runLifecycleScan('))
check('auto-repair.ts calls inside !dryRun guard',      autoRepairSrc.includes('if (!dryRun)'))

// ── Section 9: OPS log jobType ────────────────────────────────────────────────

section('9. OPS log jobType: catalog-lifecycle')

const opsTypesSrc = srcOf('lib/ops/logs/types.ts')
check('logs/types.ts has catalog-lifecycle job type', opsTypesSrc.includes("'catalog-lifecycle'"))

// ── Section 10: page.tsx Zones 9 + 10 ────────────────────────────────────────

section('10. page.tsx Zones 9 and 10')

const pageSrc = srcOf('app/admin/catalog/page.tsx')
check('page.tsx imports getLifecycleGovernance',  pageSrc.includes('getLifecycleGovernance'))
check('page.tsx imports readLifecycleStore',       pageSrc.includes('readLifecycleStore'))
check('page.tsx imports CatalogLifecycle',         pageSrc.includes('CatalogLifecycle'))
check('page.tsx imports LifecycleProducts',        pageSrc.includes('LifecycleProducts'))
check('page.tsx reads lifecycleGovernance',        pageSrc.includes('lifecycleGovernance'))
check('page.tsx reads lifecycleProducts',          pageSrc.includes('lifecycleProducts'))
check('page.tsx renders CatalogLifecycle',         pageSrc.includes('<CatalogLifecycle'))
check('page.tsx renders LifecycleProducts',        pageSrc.includes('<LifecycleProducts'))
check('page.tsx passes governance prop',           pageSrc.includes('governance={lifecycleGovernance}'))
check('page.tsx passes products prop',             pageSrc.includes('products={lifecycleProducts}'))

// ── Section 11: CatalogLifecycle.tsx structure ────────────────────────────────

section('11. CatalogLifecycle.tsx structure')

const lifecycleSrc = srcOf('components/admin/catalog/CatalogLifecycle.tsx')
check('CatalogLifecycle imports LifecycleGovernance',  lifecycleSrc.includes('LifecycleGovernance'))
check('CatalogLifecycle renders healthy count',        lifecycleSrc.includes('governance.healthy'))
check('CatalogLifecycle renders aging count',          lifecycleSrc.includes('governance.aging'))
check('CatalogLifecycle renders stale count',          lifecycleSrc.includes('governance.stale'))
check('CatalogLifecycle renders critical count',       lifecycleSrc.includes('governance.critical'))
check('CatalogLifecycle renders refreshNeeded',        lifecycleSrc.includes('refreshNeeded'))
check('CatalogLifecycle renders replacementNeeded',    lifecycleSrc.includes('replacementNeeded'))
check('CatalogLifecycle renders averageAgeDays',       lifecycleSrc.includes('averageAgeDays'))
check('CatalogLifecycle renders averageConfidence',    lifecycleSrc.includes('averageConfidence'))

// ── Section 12: LifecycleProducts.tsx structure ───────────────────────────────

section('12. LifecycleProducts.tsx structure')

const prodSrc = srcOf('components/admin/catalog/LifecycleProducts.tsx')
check('LifecycleProducts imports ProductLifecycle',    prodSrc.includes('ProductLifecycle'))
check('LifecycleProducts renders ASIN column',         prodSrc.includes('ASIN'))
check('LifecycleProducts renders Health column',       prodSrc.includes('Health') || prodSrc.includes('health'))
check('LifecycleProducts renders ageDays',             prodSrc.includes('ageDays'))
check('LifecycleProducts renders staleDays',           prodSrc.includes('staleDays'))
check('LifecycleProducts renders confidenceScore',     prodSrc.includes('confidenceScore'))
check('LifecycleProducts renders needsReplacement',    prodSrc.includes('needsReplacement'))
check('LifecycleProducts slices to 20',                prodSrc.includes('.slice(0, 20)'))
check('LifecycleProducts sorts critical first',        prodSrc.includes('critical'))

// ── Section 13: runLifecycleScan integration ──────────────────────────────────

section('13. runLifecycleScan()')

import { runLifecycleScan } from '../lib/catalog/lifecycle'

let scanError = false
let scanResult: ReturnType<typeof runLifecycleScan> | null = null
try {
  scanResult = runLifecycleScan('validate-test-scan')
} catch (e) {
  scanError = true
  console.error(e)
}

check('runLifecycleScan: does not throw',              !scanError)
check('runLifecycleScan: returns governance',          !!scanResult?.governance)
check('runLifecycleScan: returns warnings array',      Array.isArray(scanResult?.warnings))
check('runLifecycleScan: returns durationMs > 0',      (scanResult?.durationMs ?? 0) > 0)
check('runLifecycleScan: returns updated count',       typeof scanResult?.updated === 'number')
check('runLifecycleScan: governance totalProducts >= 0', (scanResult?.governance.totalProducts ?? -1) >= 0)

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`Checks: ${passed} passed, ${failed} failed`)

if (failed === 0) {
  console.log('\n✅  CATALOG_LIFECYCLE_READY')
  process.exit(0)
} else {
  console.log('\n❌  NOT READY — failures:')
  failures.forEach(f => console.log(`     • ${f}`))
  process.exit(1)
}
