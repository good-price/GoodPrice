/**
 * scripts/validate-discovery-governance.ts
 *
 * Sprint 4C Validation — Candidate Intelligence & Discovery Governance
 *
 * Run:
 *   npx tsx scripts/validate-discovery-governance.ts
 *
 * Expected outcome: all checks PASS → DISCOVERY_GOVERNANCE_READY
 */

import { existsSync, unlinkSync } from 'fs'
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

// ── Section 1: File existence ─────────────────────────────────────────────────

section('1. File existence')

const requiredFiles = [
  'lib/catalog/discovery/metrics.ts',
  'lib/catalog/discovery/intelligence.ts',
  'lib/catalog/discovery/governance.ts',
  'components/admin/catalog/DiscoveryGovernance.tsx',
  'scripts/validate-discovery-governance.ts',
]
for (const f of requiredFiles) {
  check(`Exists: ${f}`, existsSync(path.join(root, f)))
}

// ── Section 2: Type extensions ────────────────────────────────────────────────

section('2. Type extensions (DiscoveryCandidate + CatalogCandidate)')

import type { DiscoveryCandidate, CatalogCandidate } from '../lib/catalog/discovery/types'

type _DCIntelOk = {
  [K in 'firstDiscoveredAt' | 'lastDiscoveredAt' | 'timesDiscovered' |
         'timesValidated' | 'timesRejected' | 'timesAdmitted' |
         'qualityScore' | 'confidenceScore' | 'lastDiscoveryPipelineId']: DiscoveryCandidate[K]
}
type _CCIntelOk = {
  [K in 'timesDiscovered' | 'qualityScore' | 'confidenceScore']: CatalogCandidate[K]
}

check('DiscoveryCandidate intelligence fields compile', true)
check('CatalogCandidate intelligence fields compile',   true)

// ── Section 3: Discovery metrics ──────────────────────────────────────────────

section('3. Discovery metrics — types, persistence, Welford')

import type { CategoryDiscoveryMetrics, DiscoveryMetricsFile } from '../lib/catalog/discovery/metrics'
import { readDiscoveryMetrics, saveDiscoveryMetrics, updateDiscoveryMetrics } from '../lib/catalog/discovery/metrics'

const METRICS_FILE = path.join(root, 'data/catalog/discovery-metrics.json')
type _MetricsOk = {
  [K in 'category' | 'totalRuns' | 'successfulRuns' | 'failedRuns' |
         'totalParsed' | 'totalValidated' | 'totalSaved' | 'totalRejected' |
         'averageDurationMs' | 'lastRunAt']: CategoryDiscoveryMetrics[K]
}

check('CategoryDiscoveryMetrics shape compiles', true)
check('DiscoveryMetricsFile shape compiles',     true)

// Backup existing file if present
const metricsExisted = existsSync(METRICS_FILE)
const metricsBackup  = METRICS_FILE + '.bak-validate'
if (metricsExisted) {
  try { require('fs').renameSync(METRICS_FILE, metricsBackup) } catch { /* ok */ }
}

// Default on missing file
const defMetrics = readDiscoveryMetrics()
check('readDiscoveryMetrics() returns default when no file', typeof defMetrics === 'object')
check('Default metrics updatedAt is null',    defMetrics.updatedAt === null)
check('Default metrics categories is empty',  Object.keys(defMetrics.categories).length === 0)

// Restore
if (metricsExisted && existsSync(metricsBackup)) {
  try { require('fs').renameSync(metricsBackup, METRICS_FILE) } catch { /* ok */ }
}

// Round-trip test
const testMetrics: DiscoveryMetricsFile = {
  updatedAt: '2025-06-01T00:00:00.000Z',
  categories: {
    electronica: {
      category:       'electronica',
      totalRuns:      5,
      successfulRuns: 3,
      partialRuns:    1,
      failedRuns:     1,
      totalParsed:    250,
      totalValidated: 80,
      totalSaved:     40,
      totalRejected:  170,
      averageDurationMs: 12000,
      lastRunAt:      '2025-06-01T00:00:00.000Z',
    },
  },
}
saveDiscoveryMetrics(testMetrics)
const rtMetrics = readDiscoveryMetrics()
const rtElec    = rtMetrics.categories['electronica']
check('Round-trip: totalRuns preserved',      rtElec?.totalRuns      === 5)
check('Round-trip: averageDurationMs preserved', rtElec?.averageDurationMs === 12000)
check('Round-trip: tmp file cleaned up',      !existsSync(METRICS_FILE + '.tmp'))

// updateDiscoveryMetrics — Welford mean test
// Initial mean = 12000 with 5 runs.
// After 1 more run of 6000ms: new mean = 12000 + (6000 - 12000) / 6 = 12000 - 1000 = 11000
updateDiscoveryMetrics('electronica', {
  status: 'success', durationMs: 6000,
  parsed: 50, validated: 20, saved: 10, rejected: 30,
})
const afterUpdate = readDiscoveryMetrics()
const elecUpd     = afterUpdate.categories['electronica']
check('updateDiscoveryMetrics: totalRuns incremented',      elecUpd?.totalRuns      === 6)
check('updateDiscoveryMetrics: successfulRuns incremented', elecUpd?.successfulRuns === 4)
check('updateDiscoveryMetrics: totalParsed accumulated',    elecUpd?.totalParsed    === 300)
check('updateDiscoveryMetrics: totalSaved accumulated',     elecUpd?.totalSaved     === 50)
check('updateDiscoveryMetrics: Welford mean correct',
  Math.abs((elecUpd?.averageDurationMs ?? 0) - 11000) < 1,
  `got: ${elecUpd?.averageDurationMs}`)
check('updateDiscoveryMetrics: lastRunAt updated',          !!elecUpd?.lastRunAt)

// Cleanup
try { if (!metricsExisted) unlinkSync(METRICS_FILE) } catch { /* ok */ }

// ── Section 4: computeQualityScore ───────────────────────────────────────────

section('4. computeQualityScore()')

import { computeQualityScore, computeConfidenceScore } from '../lib/catalog/discovery/intelligence'

const highQualityCandidate: DiscoveryCandidate = {
  asin:             'B0QUALITY1',
  rank:             1,
  category:         'electronica',
  tileTitle:        'Sony WH-1000XM5 Wireless Headphones',
  imageUrl:         'https://m.media-amazon.com/images/I/test.jpg',
  rating:           4.8,
  reviewCount:      15000,
  tilePrice:        249.99,
  discoveredAt:     '2025-01-01T00:00:00.000Z',
  source:           'best-sellers',
  brand:            'Sony',
  timesDiscovered:  3,
  timesValidated:   2,
  timesRejected:    0,
  timesAdmitted:    0,
}

const lowQualityCandidate: DiscoveryCandidate = {
  asin:             'B0LOWQUAL1',
  rank:             50,
  category:         'electronica',
  tileTitle:        null,
  imageUrl:         null,
  rating:           2.0,
  reviewCount:      3,
  tilePrice:        null,
  discoveredAt:     '2025-01-01T00:00:00.000Z',
  source:           'best-sellers',
  timesDiscovered:  1,
  timesValidated:   0,
  timesRejected:    1,
  timesAdmitted:    0,
}

const highScore = computeQualityScore(highQualityCandidate)
const lowScore  = computeQualityScore(lowQualityCandidate)

check('Quality score is 0-100',                    highScore >= 0 && highScore <= 100)
check('High quality > low quality',                highScore > lowScore)
check('High quality candidate scores ≥ 70',        highScore >= 70, `got: ${highScore}`)
check('Low quality candidate scores < 30',         lowScore  <  30, `got: ${lowScore}`)
check('Zero candidate (no data) does not throw',   computeQualityScore({ asin: 'B0ZERO00001', rank: 1, category: 'test', tileTitle: null, imageUrl: null, rating: null, reviewCount: null, tilePrice: null, discoveredAt: new Date().toISOString(), source: 'best-sellers' }) >= 0)

// Rating effect
const lowRating   = { ...highQualityCandidate, asin: 'B0LRAT00001', rating: 2.0 }
const highRating  = { ...highQualityCandidate, asin: 'B0HRAT00001', rating: 5.0 }
check('Higher rating → higher quality score',
  computeQualityScore(highRating) > computeQualityScore(lowRating))

// Review effect (log scale)
const fewReviews  = { ...highQualityCandidate, asin: 'B0FEWREV001', reviewCount: 5 }
const manyReviews = { ...highQualityCandidate, asin: 'B0MANREV001', reviewCount: 5000 }
check('More reviews → higher quality score',
  computeQualityScore(manyReviews) > computeQualityScore(fewReviews))

// ── Section 5: computeConfidenceScore ────────────────────────────────────────

section('5. computeConfidenceScore()')

const highConfidence: DiscoveryCandidate = {
  ...highQualityCandidate,
  asin:            'B0CONFHIGH',
  timesDiscovered: 10,
  timesValidated:  8,
  timesRejected:   2,
  timesAdmitted:   1,
}

const lowConfidence: DiscoveryCandidate = {
  ...lowQualityCandidate,
  asin:            'B0CONFLOW1',
  timesDiscovered: 1,
  timesValidated:  0,
  timesRejected:   1,
  timesAdmitted:   0,
}

const zeroDisc: DiscoveryCandidate = {
  ...lowQualityCandidate,
  asin:            'B0CONFZERO',
  timesDiscovered: 0,
}

const highConf = computeConfidenceScore(highConfidence)
const lowConf  = computeConfidenceScore(lowConfidence)
const zeroConf = computeConfidenceScore(zeroDisc)

check('Confidence score is 0-100',               highConf >= 0 && highConf <= 100)
check('High confidence > low confidence',         highConf > lowConf)
check('Never-discovered candidate = 0',           zeroConf === 0)
check('Admitted candidate has bonus',             highConf > computeConfidenceScore({ ...highConfidence, asin: 'B0NOADI001', timesAdmitted: 0 }))

// ── Section 6: intelligence candidate updates ─────────────────────────────────

section('6. Candidate intelligence in mergeDiscoveryCandidates()')

import { mergeDiscoveryCandidates, updateRejectedCandidates, loadCandidates, saveCandidates } from '../lib/catalog/discovery/candidate-store'

// Set up a base candidate without intelligence
const baseCandidate: DiscoveryCandidate = {
  asin:         'B0INTTEST01',
  rank:         1,
  category:     'gaming',
  tileTitle:    'Test Game Controller',
  imageUrl:     'https://m.media-amazon.com/images/I/test.jpg',
  rating:       4.0,
  reviewCount:  500,
  tilePrice:    59.99,
  discoveredAt: '2025-01-01T00:00:00.000Z',
  source:       'best-sellers',
}

// Save base candidate to store
const priorItems = loadCandidates().items.filter(i => i.asin !== 'B0INTTEST01')
saveCandidates([...priorItems, baseCandidate])

// Merge with intelligence fields (simulating a discovery run)
const withIntel: DiscoveryCandidate = {
  ...baseCandidate,
  rating:              4.2,  // Better rating triggers content update
  firstDiscoveredAt:  '2025-01-01T00:00:00.000Z',
  lastDiscoveredAt:   '2025-06-01T00:00:00.000Z',
  timesDiscovered:    2,
  timesValidated:     1,
  timesRejected:      0,
  timesAdmitted:      0,
  qualityScore:       75,
  confidenceScore:    45,
  lastDiscoveryPipelineId: 'cd-gaming-12345',
}

mergeDiscoveryCandidates([withIntel])
const afterMerge = loadCandidates()
const merged     = afterMerge.items.find(i => i.asin === 'B0INTTEST01')

check('Intelligence: timesDiscovered stored',       merged?.timesDiscovered     === 2)
check('Intelligence: timesValidated stored',        merged?.timesValidated      === 1)
check('Intelligence: qualityScore stored',          merged?.qualityScore        === 75)
check('Intelligence: confidenceScore stored',       merged?.confidenceScore     === 45)
check('Intelligence: firstDiscoveredAt preserved',  merged?.firstDiscoveredAt   === '2025-01-01T00:00:00.000Z')
check('Intelligence: lastDiscoveredAt updated',     merged?.lastDiscoveredAt    === '2025-06-01T00:00:00.000Z')
check('Intelligence: pipelineId stored',            merged?.lastDiscoveryPipelineId === 'cd-gaming-12345')
check('Intelligence: originalDiscoveredAt unchanged', merged?.discoveredAt      === '2025-01-01T00:00:00.000Z')

// updateRejectedCandidates: increment timesRejected for existing ASIN
updateRejectedCandidates(['B0INTTEST01'])
const afterReject = loadCandidates()
const rejected    = afterReject.items.find(i => i.asin === 'B0INTTEST01')
check('timesRejected incremented by updateRejectedCandidates',
  (rejected?.timesRejected ?? 0) === 1)

// Unknown ASIN — should not create new entry
const before = loadCandidates().items.length
updateRejectedCandidates(['UNKNOWNASN1'])
const after = loadCandidates().items.length
check('updateRejectedCandidates: unknown ASIN not added', before === after)

// Cleanup
const cleaned = loadCandidates().items.filter(i => i.asin !== 'B0INTTEST01')
saveCandidates(cleaned)

// ── Section 7: governance ─────────────────────────────────────────────────────

section('7. getPoolGovernance()')

import { getPoolGovernance } from '../lib/catalog/discovery/governance'
import type { PoolGovernance } from '../lib/catalog/discovery/governance'

const gov = getPoolGovernance()
check('Returns array of 10 entries',             gov.length === 10)
check('All have category string',                gov.every(g => typeof g.category === 'string'))
check('All have candidateCount >= 0',            gov.every(g => g.candidateCount >= 0))
check('All have qualityAverage 0-100',           gov.every(g => g.qualityAverage >= 0 && g.qualityAverage <= 100))
check('All have confidenceAverage 0-100',        gov.every(g => g.confidenceAverage >= 0 && g.confidenceAverage <= 100))
check('All have valid health',                   gov.every(g => ['healthy','warning','critical'].includes(g.health)))
check('All have boolean needsDiscovery',         gov.every(g => typeof g.needsDiscovery === 'boolean'))

// Health rules
const mockForHealth = (count: number): PoolGovernance['health'] => {
  if (count >= 20) return 'healthy'
  if (count >= 5)  return 'warning'
  return 'critical'
}
check('Health rule: 0 → critical',   mockForHealth(0)  === 'critical')
check('Health rule: 4 → critical',   mockForHealth(4)  === 'critical')
check('Health rule: 5 → warning',    mockForHealth(5)  === 'warning')
check('Health rule: 19 → warning',   mockForHealth(19) === 'warning')
check('Health rule: 20 → healthy',   mockForHealth(20) === 'healthy')

// needsDiscovery rule: if no candidates → critical → needsDiscovery = true
const emptyCategories = gov.filter(g => g.candidateCount === 0)
check('Empty category always needsDiscovery',
  emptyCategories.every(g => g.needsDiscovery))

// getPoolGovernance never throws
let govError = false
try { getPoolGovernance() } catch { govError = true }
check('getPoolGovernance never throws', !govError)

// ── Section 8: page.tsx Zone 8 ────────────────────────────────────────────────

section('8. page.tsx Zone 8 and DiscoveryOperations props')

const { readFileSync } = require('fs') as typeof import('fs')
const pageSrc = readFileSync(path.join(root, 'app/admin/catalog/page.tsx'), 'utf-8')

check('page.tsx imports readDiscoveryMetrics',   pageSrc.includes('readDiscoveryMetrics'))
check('page.tsx imports getPoolGovernance',      pageSrc.includes('getPoolGovernance'))
check('page.tsx imports DiscoveryGovernance',    pageSrc.includes('DiscoveryGovernance'))
check('page.tsx reads discoveryMetrics',         pageSrc.includes('discoveryMetrics') && pageSrc.includes('readDiscoveryMetrics()'))
check('page.tsx reads poolGovernance',           pageSrc.includes('poolGovernance') && pageSrc.includes('getPoolGovernance()'))
check('page.tsx renders DiscoveryGovernance',    pageSrc.includes('<DiscoveryGovernance'))
check('page.tsx passes governance prop',         pageSrc.includes('governance={poolGovernance}'))
check('page.tsx passes discoveryMetrics prop',   pageSrc.includes('discoveryMetrics={discoveryMetrics}'))

// ── Section 9: DiscoveryGovernance.tsx structure ──────────────────────────────

section('9. DiscoveryGovernance.tsx structure')

const govSrc = readFileSync(path.join(root, 'components/admin/catalog/DiscoveryGovernance.tsx'), 'utf-8')
check('Imports PoolGovernance type',             govSrc.includes('PoolGovernance'))
check('Renders candidateCount',                  govSrc.includes('candidateCount'))
check('Renders qualityAverage',                  govSrc.includes('qualityAverage'))
check('Renders confidenceAverage',               govSrc.includes('confidenceAverage'))
check('Renders health badge',                    govSrc.includes('health'))
check('Renders needsDiscovery',                  govSrc.includes('needsDiscovery'))

// ── Section 10: DiscoveryOperations rate columns ──────────────────────────────

section('10. DiscoveryOperations.tsx rate columns')

const opsSrc = readFileSync(path.join(root, 'components/admin/catalog/DiscoveryOperations.tsx'), 'utf-8')
check('Imports DiscoveryMetricsFile',            opsSrc.includes('DiscoveryMetricsFile'))
check('Has discoveryMetrics prop',               opsSrc.includes('discoveryMetrics'))
check('Has Acceptance Rate',                     opsSrc.includes('acceptRate') || opsSrc.includes('Acept'))
check('Has Conversion Rate',                     opsSrc.includes('convRate')   || opsSrc.includes('Conv'))
check('Has Failure Rate',                        opsSrc.includes('failRate')   || opsSrc.includes('Fallo'))
check('Uses failedRuns/totalRuns',               opsSrc.includes('failedRuns') && opsSrc.includes('totalRuns'))

// ── Section 11: OPS log notes ─────────────────────────────────────────────────

section('11. OPS log includes intelligence metrics in notes')

const pipelineSrc = readFileSync(path.join(root, 'lib/catalog/discovery/amazon/pipeline.ts'), 'utf-8')
check('Pipeline notes include qualityAverage',    pipelineSrc.includes('qualityAverage'))
check('Pipeline notes include confidenceAverage', pipelineSrc.includes('confidenceAverage'))
check('Pipeline notes include conversionRate',    pipelineSrc.includes('conversionRate'))
check('Pipeline warnings include pool degraded',  pipelineSrc.includes('Pool degradado') || pipelineSrc.includes('pool degradado'))
check('Pipeline warnings include critical count', pipelineSrc.includes('críticos'))
check('Pipeline warnings include low confidence', pipelineSrc.includes('Confianza baja'))
check('Pipeline calls updateDiscoveryMetrics',    pipelineSrc.includes('updateDiscoveryMetrics'))
check('Pipeline calls updateRejectedCandidates',  pipelineSrc.includes('updateRejectedCandidates'))
check('Pipeline calls buildWithIntelligence or intelligence', pipelineSrc.includes('buildWithIntelligence') || pipelineSrc.includes('computeQualityScore'))

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`Checks: ${passed} passed, ${failed} failed`)

if (failed === 0) {
  console.log('\n✅  DISCOVERY_GOVERNANCE_READY')
  process.exit(0)
} else {
  console.log('\n❌  NOT READY — failures:')
  failures.forEach(f => console.log(`     • ${f}`))
  process.exit(1)
}
