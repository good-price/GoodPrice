/**
 * scripts/migrate-to-pool.ts
 *
 * One-time migration: reads all 198 products from data/catalog/ TypeScript
 * files and writes them to data/tpe/candidate-pool.json as pending candidates.
 *
 * Run from the goodprice/ directory:
 *   npx tsx scripts/migrate-to-pool.ts
 *
 * Idempotent: products already in the pool (same id OR same asin) are skipped.
 * The public catalog is NOT modified. No feature flags are activated.
 *
 * Output:
 *   - Migration summary (migrated / skipped / anomalies)
 *   - Per-category breakdown
 *   - Predicted gate failures (pre-flight, informational only)
 *   - Specific anomaly flags (recalls, restrictions, inactive products)
 */

import { getRawProducts } from '@/data/catalog'
import { getCandidatePool, saveCandidatePool } from '@/lib/tpe/pool'
import type { CandidateRecord, CandidatePoolStore } from '@/types'

// ── Configuration ─────────────────────────────────────────────────────────────

const MIGRATION_TIMESTAMP = new Date().toISOString()

// Gate 8 pattern: images using the /P/ path format require PA-API to resolve
const P_FORMAT_PATTERN = /\/images\/P\//i

// Known CDN prefixes that may have accessibility issues (gate 9 risk)
const LEGACY_CDN_PREFIX = 'images-na.ssl-images-amazon.com'

// ── Anomaly detection helpers ─────────────────────────────────────────────────

interface PredictedFailure {
  id: string
  asin: string
  title: string
  gate: string
  reason: string
}

interface MigrationAnomaly {
  id: string
  asin: string
  title: string
  category: string
  type: 'recall' | 'chapter11' | 'inactive_restriction' | 'colombia_unconfirmed' | 'p_format_image'
  detail: string
}

function detectAnomalies(
  products: ReturnType<typeof getRawProducts>,
): {
  predictedFailures: PredictedFailure[]
  anomalies: MigrationAnomaly[]
} {
  const predictedFailures: PredictedFailure[] = []
  const anomalies: MigrationAnomaly[] = []
  const seen = new Set<string>() // track ids already added to anomalies

  function addFailure(id: string, asin: string, title: string, gate: string, reason: string) {
    predictedFailures.push({ id, asin, title, gate, reason })
  }

  function addAnomaly(
    id: string,
    asin: string,
    title: string,
    category: string,
    type: MigrationAnomaly['type'],
    detail: string,
  ) {
    if (!seen.has(`${type}:${id}`)) {
      anomalies.push({ id, asin, title, category, type, detail })
      seen.add(`${type}:${id}`)
    }
  }

  for (const p of products) {
    const { id, asin, title, category } = p

    // ── Gate 6: status_active ──────────────────────────────────────────────────
    if (p.status && p.status !== 'active') {
      addFailure(id, asin, title, 'gate_6 (status_active)', `status = '${p.status}'`)
    }

    // ── Gate 4: colombia_unrestricted ──────────────────────────────────────────
    if (p.colombiaRestriction) {
      addFailure(id, asin, title, 'gate_4 (colombia_unrestricted)', `restriction: ${p.colombiaRestriction.slice(0, 80)}`)
    }

    // ── Gate 5: colombia_confirmed ─────────────────────────────────────────────
    if (p.shipsToColombiaConfirmed !== true) {
      addFailure(id, asin, title, 'gate_5 (colombia_confirmed)', 'shipsToColombiaConfirmed !== true')
    }

    // ── Gate 8: image_not_placeholder ─────────────────────────────────────────
    if (P_FORMAT_PATTERN.test(p.image)) {
      addFailure(id, asin, title, 'gate_8 (image_not_placeholder)', '/P/ format image — requires PA-API')
    }

    // ── Specific anomaly flags (for report only) ───────────────────────────────

    // RECALL detection: keyword scan on restriction notes
    if (p.colombiaRestriction) {
      const note = p.colombiaRestriction.toLowerCase()
      if (note.includes('recall') || note.includes('retirad')) {
        addAnomaly(id, asin, title, category, 'recall', p.colombiaRestriction)
      } else if (note.includes('chapter 11') || note.includes('bancarrota')) {
        addAnomaly(id, asin, title, category, 'chapter11', p.colombiaRestriction)
      } else {
        addAnomaly(id, asin, title, category, 'inactive_restriction', p.colombiaRestriction)
      }
    }

    // Colombia unconfirmed (no restriction, but shipping not confirmed)
    if (!p.colombiaRestriction && p.shipsToColombiaConfirmed !== true) {
      addAnomaly(id, asin, title, category, 'colombia_unconfirmed', 'shipsToColombiaConfirmed is not true (no explicit restriction)')
    }

    // /P/ format images
    if (P_FORMAT_PATTERN.test(p.image)) {
      addAnomaly(id, asin, title, category, 'p_format_image', p.image)
    }
  }

  return { predictedFailures, anomalies }
}

// ── Candidate builder ─────────────────────────────────────────────────────────

function buildCandidate(
  raw: ReturnType<typeof getRawProducts>[number],
): CandidateRecord {
  return {
    // ── Product identity (copied verbatim from RawProduct) ────────────────────
    id:                       raw.id,
    asin:                     raw.asin,
    title:                    raw.title,
    category:                 raw.category,
    brand:                    raw.brand,
    image:                    raw.image,
    price:                    raw.price,
    oldPrice:                 raw.oldPrice,
    rating:                   raw.rating,
    reviews:                  raw.reviews,
    badge:                    raw.badge,
    isTopSeller:              raw.isTopSeller,
    isOffer:                  raw.isOffer,
    description:              raw.description,
    shipsToColombiaConfirmed: raw.shipsToColombiaConfirmed,
    colombiaRestriction:      raw.colombiaRestriction,
    // Preserve original product status so Gate 6 can check it without HTTP
    productStatus:            raw.status,

    // ── Provenance ────────────────────────────────────────────────────────────
    source:  'legacy_migration',
    addedAt: MIGRATION_TIMESTAMP,

    // ── Evaluation state (all pending, never evaluated) ───────────────────────
    status:          'pending',
    evaluationCount: 0,
  }
}

// ── Deduplication ─────────────────────────────────────────────────────────────

interface DuplicateRecord {
  id: string
  asin: string
  title: string
  reason: 'duplicate_id' | 'duplicate_asin'
}

function deduplicate(
  incoming: CandidateRecord[],
  existing: CandidateRecord[],
): {
  toAdd:      CandidateRecord[]
  duplicates: DuplicateRecord[]
} {
  const existingIds   = new Set(existing.map(c => c.id))
  const existingAsins = new Set(existing.map(c => c.asin))

  // Also deduplicate within the incoming batch itself
  const seenIdsLocal   = new Set<string>()
  const seenAsinsLocal = new Set<string>()

  const toAdd:      CandidateRecord[] = []
  const duplicates: DuplicateRecord[] = []

  for (const candidate of incoming) {
    if (existingIds.has(candidate.id) || seenIdsLocal.has(candidate.id)) {
      duplicates.push({ id: candidate.id, asin: candidate.asin, title: candidate.title, reason: 'duplicate_id' })
      continue
    }
    if (existingAsins.has(candidate.asin) || seenAsinsLocal.has(candidate.asin)) {
      duplicates.push({ id: candidate.id, asin: candidate.asin, title: candidate.title, reason: 'duplicate_asin' })
      continue
    }
    toAdd.push(candidate)
    seenIdsLocal.add(candidate.id)
    seenAsinsLocal.add(candidate.asin)
  }

  return { toAdd, duplicates }
}

// ── Report printer ────────────────────────────────────────────────────────────

const DIVIDER = '─'.repeat(72)

function printReport(params: {
  legacyTotal:       number
  migrated:          number
  duplicates:        DuplicateRecord[]
  byCategory:        Record<string, number>
  predictedFailures: PredictedFailure[]
  anomalies:         MigrationAnomaly[]
  durationMs:        number
}) {
  const {
    legacyTotal, migrated, duplicates, byCategory,
    predictedFailures, anomalies, durationMs,
  } = params

  console.log('\n' + DIVIDER)
  console.log('  GOODPRICE — Trusted Product Engine v1')
  console.log('  Candidate Pool Migration Report')
  console.log(DIVIDER)
  console.log(`  Run at:   ${MIGRATION_TIMESTAMP}`)
  console.log(`  Duration: ${durationMs}ms`)
  console.log(DIVIDER)

  console.log('\n  SUMMARY')
  console.log(`  Legacy products read:   ${legacyTotal}`)
  console.log(`  Migrated to pool:       ${migrated}`)
  console.log(`  Duplicates skipped:     ${duplicates.length}`)
  console.log(`  Products without ASIN:  0  (none — RawProduct.asin is required)`)

  if (duplicates.length > 0) {
    console.log('\n  DUPLICATES SKIPPED')
    for (const d of duplicates) {
      console.log(`  [${d.reason}] ${d.id} / ${d.asin} — ${d.title.slice(0, 55)}`)
    }
  }

  console.log('\n  CANDIDATES BY CATEGORY')
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1])
  for (const [cat, count] of sorted) {
    console.log(`  ${cat.padEnd(16)} ${count} candidate(s)`)
  }

  // Predicted gate failures — grouped by gate
  const failuresByGate: Record<string, PredictedFailure[]> = {}
  for (const f of predictedFailures) {
    if (!failuresByGate[f.gate]) failuresByGate[f.gate] = []
    failuresByGate[f.gate].push(f)
  }

  console.log('\n  PREDICTED GATE FAILURES (pre-flight, informational)')
  console.log('  These candidates will be rejected when the admission pipeline runs.')
  if (Object.keys(failuresByGate).length === 0) {
    console.log('  None detected.')
  } else {
    for (const [gate, failures] of Object.entries(failuresByGate)) {
      console.log(`\n  ${gate.toUpperCase()} — ${failures.length} candidate(s)`)
      for (const f of failures.slice(0, 5)) {
        console.log(`    • ${f.id}: ${f.reason.slice(0, 70)}`)
      }
      if (failures.length > 5) {
        console.log(`    … and ${failures.length - 5} more`)
      }
    }
  }

  // Specific anomaly flags
  const recallItems    = anomalies.filter(a => a.type === 'recall')
  const chapter11Items = anomalies.filter(a => a.type === 'chapter11')

  if (recallItems.length > 0 || chapter11Items.length > 0) {
    console.log('\n  ⚠ HIGH-PRIORITY FLAGS')
    for (const a of recallItems) {
      console.log(`  [RECALL]     ${a.id} — ${a.title.slice(0, 55)}`)
      console.log(`               ${a.detail.slice(0, 90)}`)
    }
    for (const a of chapter11Items) {
      console.log(`  [CHAPTER 11] ${a.id} — ${a.title.slice(0, 55)}`)
      console.log(`               ${a.detail.slice(0, 90)}`)
    }
  }

  const pFormatCount    = anomalies.filter(a => a.type === 'p_format_image').length
  const unconfirmedCount = anomalies.filter(a => a.type === 'colombia_unconfirmed').length

  console.log('\n  IMAGE & COLOMBIA SUMMARY')
  console.log(`  /P/ format images (gate 8 will fail):    ${pFormatCount}`)
  console.log(`  Colombia unconfirmed (gate 5 will fail): ${unconfirmedCount}`)

  console.log('\n' + DIVIDER)
  console.log('  Migration complete.')
  console.log('  All candidates are status=pending. No feature flags were activated.')
  console.log('  Next: run Fase 3 (admission pipeline) to evaluate candidates.')
  console.log(DIVIDER + '\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startMs = Date.now()

  // 1. Read legacy catalog
  const rawProducts = getRawProducts()
  const legacyTotal = rawProducts.length

  // 2. Detect anomalies (pre-flight, does NOT block migration)
  const { predictedFailures, anomalies } = detectAnomalies(rawProducts)

  // 3. Convert to CandidateRecord[]
  const incoming = rawProducts.map(buildCandidate)

  // 4. Load existing pool and deduplicate
  const existingPool = getCandidatePool()
  const { toAdd, duplicates } = deduplicate(incoming, existingPool.candidates)

  // 5. Build per-category counts (only for the candidates being added)
  const byCategory: Record<string, number> = {}
  for (const c of toAdd) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1
  }

  // 6. Bulk write — one save operation for all candidates
  const updatedStore: CandidatePoolStore = {
    ...existingPool,
    candidates: [...existingPool.candidates, ...toAdd],
  }
  saveCandidatePool(updatedStore)

  // 7. Print report
  printReport({
    legacyTotal,
    migrated:    toAdd.length,
    duplicates,
    byCategory,
    predictedFailures,
    anomalies,
    durationMs:  Date.now() - startMs,
  })
}

main().catch(err => {
  console.error('\n  Migration failed:', err)
  process.exit(1)
})
