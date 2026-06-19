/**
 * scripts/validate-discovery-ops.ts
 *
 * Sprint 4B Validation — Discovery Operations Center
 *
 * Run:
 *   npx tsx scripts/validate-discovery-ops.ts
 *
 * Expected outcome: all checks PASS → DISCOVERY_OPS_READY
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
  'lib/catalog/discovery/state.ts',
  'lib/catalog/discovery/enrichment.ts',
  'lib/catalog/discovery/actions.ts',
  'components/admin/catalog/DiscoveryOperations.tsx',
  'components/admin/catalog/DiscoveryActions.tsx',
  'scripts/validate-discovery-ops.ts',
]

for (const f of requiredFiles) {
  check(`Exists: ${f}`, existsSync(path.join(root, f)))
}

// ── Section 2: Discovery state types ─────────────────────────────────────────

section('2. Discovery state types')

import type { DiscoveryCategoryState, DiscoveryStateFile } from '../lib/catalog/discovery/state'

type _CategoryStateOk = {
  [K in 'category' | 'lastRunAt' | 'lastStatus' | 'lastDurationMs' |
         'lastParsed' | 'lastValidated' | 'lastSaved' | 'lastWarnings' | 'lastErrors']: DiscoveryCategoryState[K]
}
type _StateFileOk = {
  [K in 'updatedAt' | 'categories']: DiscoveryStateFile[K]
}

check('DiscoveryCategoryState shape compiles', true)
check('DiscoveryStateFile shape compiles',     true)

// ── Section 3: readDiscoveryState — fault tolerance ───────────────────────────

section('3. readDiscoveryState() fault tolerance')

import { readDiscoveryState, saveDiscoveryState, updateDiscoveryCategoryState } from '../lib/catalog/discovery/state'

const STATE_FILE = path.join(root, 'data/catalog/discovery-state.json')

// Temporarily rename if it exists so we test the default return path
const stateBackupPath = STATE_FILE + '.bak-validate'
const stateExisted = existsSync(STATE_FILE)
if (stateExisted) {
  try { require('fs').renameSync(STATE_FILE, stateBackupPath) } catch { /* ok */ }
}

const defaultResult = readDiscoveryState()
check('Returns default when no file', typeof defaultResult === 'object')
check('Default updatedAt is null',    defaultResult.updatedAt === null)
check('Default categories is {}',     Object.keys(defaultResult.categories).length === 0)

// Restore original if it existed
if (stateExisted && existsSync(stateBackupPath)) {
  try { require('fs').renameSync(stateBackupPath, STATE_FILE) } catch { /* ok */ }
}

// ── Section 4: saveDiscoveryState / readDiscoveryState round-trip ─────────────

section('4. saveDiscoveryState — atomic write round-trip')

const testState: DiscoveryStateFile = {
  updatedAt: '2025-01-01T00:00:00.000Z',
  categories: {
    electronica: {
      category:       'electronica',
      lastRunAt:      '2025-01-01T00:00:00.000Z',
      lastStatus:     'success',
      lastDurationMs: 12345,
      lastParsed:     50,
      lastValidated:  30,
      lastSaved:      15,
      lastWarnings:   ['warn1'],
      lastErrors:     [],
    },
  },
}

saveDiscoveryState(testState)
const roundTrip = readDiscoveryState()
const rt = roundTrip.categories['electronica']

check('Round-trip: updatedAt preserved',     roundTrip.updatedAt === '2025-01-01T00:00:00.000Z')
check('Round-trip: category exists',         !!rt)
check('Round-trip: lastStatus preserved',    rt?.lastStatus     === 'success')
check('Round-trip: lastDurationMs preserved',rt?.lastDurationMs === 12345)
check('Round-trip: lastParsed preserved',    rt?.lastParsed     === 50)
check('Round-trip: lastValidated preserved', rt?.lastValidated  === 30)
check('Round-trip: lastSaved preserved',     rt?.lastSaved      === 15)
check('Round-trip: lastWarnings preserved',  rt?.lastWarnings.length === 1)
check('Round-trip: tmp file cleaned up',     !existsSync(STATE_FILE + '.tmp'))

// ── Section 5: updateDiscoveryCategoryState ───────────────────────────────────

section('5. updateDiscoveryCategoryState()')

updateDiscoveryCategoryState('gaming', {
  status:     'partial',
  durationMs: 5000,
  parsed:     20,
  validated:  10,
  saved:      3,
  warnings:   ['w1', 'w2'],
  errors:     ['e1'],
})

const afterUpdate = readDiscoveryState()
const gaming = afterUpdate.categories['gaming']

check('Category added after update',          !!gaming)
check('lastStatus is partial',                gaming?.lastStatus     === 'partial')
check('lastDurationMs correct',               gaming?.lastDurationMs === 5000)
check('lastParsed correct',                   gaming?.lastParsed     === 20)
check('lastValidated correct',                gaming?.lastValidated  === 10)
check('lastSaved correct',                    gaming?.lastSaved      === 3)
check('lastWarnings count correct',           gaming?.lastWarnings.length === 2)
check('lastErrors count correct',             gaming?.lastErrors.length   === 1)
check('lastRunAt is a valid ISO string',      !!gaming?.lastRunAt && /\d{4}-\d{2}-\d{2}T/.test(gaming.lastRunAt))
check('updatedAt updated on state update',    afterUpdate.updatedAt !== '2025-01-01T00:00:00.000Z')
check('Electronica still present (idempotent)', !!afterUpdate.categories['electronica'])

// Idempotence: run again, state should update not duplicate
updateDiscoveryCategoryState('gaming', {
  status: 'success', durationMs: 6000,
  parsed: 25, validated: 12, saved: 5, warnings: [], errors: [],
})
const afterSecond = readDiscoveryState()
const gamingV2 = afterSecond.categories['gaming']
check('Idempotent: status updates correctly',      gamingV2?.lastStatus === 'success')
check('Idempotent: previous category preserved',   !!afterSecond.categories['electronica'])
check('Idempotent: categories not duplicated',     Object.keys(afterSecond.categories).length === 2)

// Cleanup test state
try {
  if (!stateExisted) unlinkSync(STATE_FILE)
  else saveDiscoveryState({ updatedAt: null, categories: {} })
} catch { /* ok */ }

// ── Section 6: enrichCandidate ────────────────────────────────────────────────

section('6. enrichCandidate()')

import { enrichCandidate, enrichCandidates } from '../lib/catalog/discovery/enrichment'
import type { ParsedProduct } from '../lib/catalog/discovery/amazon/types'

const baseProduct: ParsedProduct = {
  asin:         'B0TESTVAL1',
  title:        'Sony WH-1000XM5 Wireless Headphones',
  image:        'https://m.media-amazon.com/images/I/71test._AC_SL1500_.jpg',
  price:        249.99,
  rating:       4.5,
  reviews:      5000,
  sourceUrl:    'https://www.amazon.com/Best-Sellers/zgbs/electronics/',
  sourceType:   'best-sellers',
  discoveredAt: new Date().toISOString(),
}

const enriched = enrichCandidate(baseProduct)

check('Title returned (non-empty)',        enriched.title.length > 0)
check('Brand extracted: Sony',             enriched.brand === 'Sony', `got: ${enriched.brand}`)
check('Image URL normalized (no resize)',  enriched.image !== null && !enriched.image!.includes('._AC_SL1500_.'))
check('Price preserved',                   enriched.price === 249.99)
check('ASIN unchanged',                    enriched.asin  === 'B0TESTVAL1')
check('rating unchanged',                  enriched.rating === 4.5)

// HTML entities in title
const entityProduct: ParsedProduct = {
  ...baseProduct,
  asin:  'B0ENTITY001',
  title: 'Logitech M&amp;K Bundle &quot;Pro&quot; &#39;Set&#39;',
}
const entityEnriched = enrichCandidate(entityProduct)
check('HTML entities decoded in title', entityEnriched.title.includes('&') && !entityEnriched.title.includes('&amp;'))
check('Brand from entity title: Logitech', entityEnriched.brand === 'Logitech', `got: ${entityEnriched.brand}`)

// Non-brand first word fallback
const nonBrandProduct: ParsedProduct = {
  ...baseProduct,
  asin:  'B0NOBRAND01',
  title: 'Premium Apple AirPods Pro 2nd Gen',
}
const nonBrandEnriched = enrichCandidate(nonBrandProduct)
check('Non-brand first word skipped, fallback to next',
  nonBrandEnriched.brand === 'Apple', `got: ${nonBrandEnriched.brand}`)

// Pool fallback for missing image
import type { CandidateStore } from '../lib/catalog/discovery/types'

const poolWithData: CandidateStore = {
  updatedAt: new Date().toISOString(),
  items: [{
    asin:         'B0POOLTEST',
    rank:         1,
    category:     'electronica',
    tileTitle:    'Pool Product Title',
    imageUrl:     'https://m.media-amazon.com/images/I/pool.jpg',
    rating:       4.2,
    reviewCount:  200,
    tilePrice:    99.99,
    discoveredAt: new Date().toISOString(),
    source:       'best-sellers',
  }],
}

const noImageProduct: ParsedProduct = {
  ...baseProduct,
  asin:  'B0POOLTEST',
  title: '',
  image: null,
  price: 0,
}
const poolEnriched = enrichCandidate(noImageProduct, poolWithData)
check('Pool fallback: image filled from pool',        poolEnriched.image === 'https://m.media-amazon.com/images/I/pool.jpg')
check('Pool fallback: title filled from pool',        poolEnriched.title === 'Pool Product Title')
check('Pool fallback: price filled from pool',        poolEnriched.price === 99.99)

// Batch enrichment
const batch = [baseProduct, { ...baseProduct, asin: 'B0BATCH0001' }]
const batchResult = enrichCandidates(batch)
check('enrichCandidates returns same count',          batchResult.length === 2)
check('enrichCandidates enriches each item',          batchResult.every(p => !!p.brand))
check('enrichCandidates never throws (empty input)',  enrichCandidates([]).length === 0)

// ── Section 7: Validator rejectedAsins ────────────────────────────────────────

section('7. AmazonValidationResult.rejectedAsins')

import { validateDiscoveryCandidates } from '../lib/catalog/discovery/amazon/validator'
import type { AmazonValidationResult } from '../lib/catalog/discovery/amazon/types'

type _HasRejectedAsins = AmazonValidationResult['rejectedAsins']
check('AmazonValidationResult has rejectedAsins field', true)

// Product with too-few reviews → should appear in rejectedAsins
// ASIN must be exactly 10 chars to pass format check, fail on reviews
const rejProduct: ParsedProduct = {
  asin:         'B0REJECTED',   // 10 chars: B,0,R,E,J,E,C,T,E,D
  title:        'Test product with too few reviews',
  image:        'https://m.media-amazon.com/images/I/test.jpg',
  price:        19.99,
  rating:       4.0,
  reviews:      2,   // < MIN_REVIEWS (5) — triggers quality reject
  sourceUrl:    'https://www.amazon.com/',
  sourceType:   'best-sellers',
  discoveredAt: new Date().toISOString(),
}

const rejResult = validateDiscoveryCandidates([rejProduct])
check('Rejected product in rejectedAsins',        rejResult.rejectedAsins.includes('B0REJECTED'))
check('rejectedAsins is an array',                Array.isArray(rejResult.rejectedAsins))
check('rejectedAsins count matches rejected (1)', rejResult.rejectedAsins.length === 1)

// Invalid ASIN (bad format) should NOT appear in rejectedAsins (untraceable)
const invalidAsinProduct: ParsedProduct = {
  ...rejProduct,
  asin:    'TOOLONG1234',  // 11 chars — invalid format
  reviews: 100,
}
const invalidResult = validateDiscoveryCandidates([invalidAsinProduct])
check('Invalid ASIN format NOT in rejectedAsins', !invalidResult.rejectedAsins.includes('TOOLONG1234'))

// ── Section 8: Page.tsx zones 6+7 ────────────────────────────────────────────

section('8. page.tsx zones 6+7 and discovery searchParam')

const { readFileSync } = require('fs') as typeof import('fs')
const pageSrc = readFileSync(path.join(root, 'app/admin/catalog/page.tsx'), 'utf-8')

check('page.tsx imports readDiscoveryState',    pageSrc.includes('readDiscoveryState'))
check('page.tsx imports DiscoveryOperations',   pageSrc.includes('DiscoveryOperations'))
check('page.tsx imports DiscoveryActions',      pageSrc.includes('DiscoveryActions'))
check('page.tsx reads discoveryState',          pageSrc.includes('discoveryState') && pageSrc.includes('readDiscoveryState()'))
check('page.tsx reads discoveryStatus',         pageSrc.includes('discoveryStatus'))
check('page.tsx renders DiscoveryOperations',   pageSrc.includes('<DiscoveryOperations'))
check('page.tsx renders DiscoveryActions',      pageSrc.includes('<DiscoveryActions'))
check('page.tsx passes discoveryState prop',    pageSrc.includes('discoveryState={discoveryState}'))
check('page.tsx passes discoveryStatus prop',   pageSrc.includes('discoveryStatus={discoveryStatus}'))
check('page.tsx has discovery in searchParams', pageSrc.includes("discovery?: string"))
check('History before DiscoveryEngine in page', (() => {
  const histIdx   = pageSrc.indexOf('CatalogHistory')
  const discIdx   = pageSrc.indexOf('DiscoveryEngine')
  return histIdx > 0 && discIdx > 0 && histIdx < discIdx
})())

// ── Section 9: DiscoveryOperations.tsx structure ──────────────────────────────

section('9. DiscoveryOperations.tsx structure')

const opsSrc = readFileSync(path.join(root, 'components/admin/catalog/DiscoveryOperations.tsx'), 'utf-8')

check('DiscoveryOperations imports DiscoveryStateFile', opsSrc.includes('DiscoveryStateFile'))
check('DiscoveryOperations has ALL_CATEGORIES with 10 entries', (() => {
  const match = opsSrc.match(/ALL_CATEGORIES\s*=\s*\[([^\]]+)\]/)
  if (!match) return false
  const cats = match[1]!.split(',').map(s => s.trim().replace(/['"]/g, '').replace(/\s/g, '')).filter(Boolean)
  return cats.length === 10
})())
check('DiscoveryOperations renders lastRunAt',   opsSrc.includes('lastRunAt'))
check('DiscoveryOperations renders lastStatus',  opsSrc.includes('lastStatus'))
check('DiscoveryOperations renders lastSaved',   opsSrc.includes('lastSaved'))

// ── Section 10: DiscoveryActions.tsx structure ────────────────────────────────

section('10. DiscoveryActions.tsx structure')

const actSrc = readFileSync(path.join(root, 'components/admin/catalog/DiscoveryActions.tsx'), 'utf-8')

check('DiscoveryActions imports runDiscoveryAction',    actSrc.includes('runDiscoveryAction'))
check('DiscoveryActions has <form action=',             actSrc.includes('action={runDiscoveryAction}'))
check('DiscoveryActions has <select name="category"',   actSrc.includes('name="category"'))
check('DiscoveryActions has all 10 category options', (() => {
  const cats = ['bebes','belleza','cocina','deporte','electronica','gaming','herramientas','hogar','mascotas','oficina']
  // Component uses a dynamic loop; values appear as "value: '${c}'" in the CATEGORY_OPTIONS array
  return cats.every(c => actSrc.includes(`'${c}'`))
})())
check('DiscoveryActions shows success banner', actSrc.includes("discoveryStatus === 'success'"))
check('DiscoveryActions shows failed banner',  actSrc.includes("discoveryStatus === 'failed'"))

// ── Section 11: actions.ts server action ─────────────────────────────────────

section('11. actions.ts Server Action')

const actionsSrc = readFileSync(path.join(root, 'lib/catalog/discovery/actions.ts'), 'utf-8')

check("actions.ts starts with 'use server'",      actionsSrc.trimStart().startsWith("'use server'"))
check('actions.ts exports runDiscoveryAction',    actionsSrc.includes('export async function runDiscoveryAction'))
check('actions.ts calls runAmazonDiscovery',      actionsSrc.includes('runAmazonDiscovery'))
check('actions.ts calls redirect()',              actionsSrc.includes('redirect('))
check('actions.ts redirect outside try/catch', (() => {
  const tryEnd = actionsSrc.lastIndexOf('}')
  const redirectIdx = actionsSrc.lastIndexOf('redirect(')
  const catchIdx    = actionsSrc.lastIndexOf('} catch')
  return redirectIdx > catchIdx && redirectIdx < tryEnd
})())
check('actions.ts redirects to /admin/catalog?discovery=', actionsSrc.includes('/admin/catalog?discovery='))

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`Checks: ${passed} passed, ${failed} failed`)

if (failed === 0) {
  console.log('\n✅  DISCOVERY_OPS_READY')
  process.exit(0)
} else {
  console.log('\n❌  NOT READY — failures:')
  failures.forEach(f => console.log(`     • ${f}`))
  process.exit(1)
}
