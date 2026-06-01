/**
 * lib/tpe/discovery/candidate-builder.ts
 *
 * Sprint 5A — Discovery Lite
 *
 * Converts raw DiscoveryCandidate objects (emitted by any discovery source)
 * into CandidateRecord objects compatible with the Candidate Pool.
 *
 * All built records have:
 *   source          = 'discovery_engine'
 *   status          = 'pending'
 *   evaluationCount = 0
 *   productStatus   = 'active'    (Gate 6 requirement)
 *   shipsToColombiaConfirmed = true  (Gate 5 requirement, unless explicitly false)
 *
 * ID generation convention for discovery-sourced candidates:
 *   {category-prefix}-d{2-digit-seq}
 *   e.g. "bebe-d01", "bell-d03", "herr-d07"
 *
 * The "-d" infix makes discovery candidates instantly recognisable in the pool
 * without affecting any gate logic (id is not inspected by any gate).
 */

import type { CandidateRecord, DiscoveryCandidate } from '@/types'

// ── Category prefix map ───────────────────────────────────────────────────────

/** Maps full category slug to the short prefix used in candidate IDs. */
export const CATEGORY_ID_PREFIX: Record<string, string> = {
  electronica:  'elec',
  gaming:       'game',
  hogar:        'hogar',
  cocina:       'coci',
  deporte:      'dep',
  oficina:      'ofic',
  belleza:      'bell',
  mascotas:     'masc',
  bebes:        'bebe',
  herramientas: 'herr',
}

// ── Single candidate builder ──────────────────────────────────────────────────

/**
 * Build a single CandidateRecord from raw discovery data.
 *
 * @param raw  The raw candidate emitted by a discovery source
 * @param id   Pre-computed unique ID (caller is responsible for uniqueness)
 * @param now  ISO 8601 timestamp for addedAt
 */
export function buildCandidateRecord(
  raw: DiscoveryCandidate,
  id:  string,
  now: string,
): CandidateRecord {
  return {
    // ── Identity ──────────────────────────────────────────────────────────────
    id,
    asin:        raw.asin,
    title:       raw.title,
    category:    raw.category,
    brand:       raw.brand,
    image:       raw.image,
    price:       raw.price,
    oldPrice:    raw.oldPrice,
    rating:      raw.rating,
    reviews:     raw.reviews,
    badge:       raw.badge,
    isTopSeller: raw.isTopSeller  ?? false,
    isOffer:     raw.isOffer      ?? false,
    description: raw.description,

    // ── Colombia compliance (Gates 4–5) ───────────────────────────────────────
    shipsToColombiaConfirmed: raw.shipsToColombiaConfirmed ?? true,
    // colombiaRestriction intentionally absent → Gate 4 passes

    // ── Lifecycle (Gate 6) ────────────────────────────────────────────────────
    productStatus: 'active',

    // ── Provenance ────────────────────────────────────────────────────────────
    source:  'discovery_engine',
    addedAt: now,

    // ── Evaluation state ──────────────────────────────────────────────────────
    status:          'pending',
    evaluationCount: 0,
    // lastBundle, firstApprovedAt, rejectedAt, rejectionGate intentionally absent
  }
}

// ── Batch builder ─────────────────────────────────────────────────────────────

/**
 * Build multiple CandidateRecords from a list of raw discovery candidates
 * that passed the deduplicator.
 *
 * IDs are generated as `{prefix}-d{seq}` where:
 *   prefix  = CATEGORY_ID_PREFIX[category] (falls back to first 4 chars of category)
 *   seq     = 2-digit sequential counter starting at `startSeq`
 *
 * Only candidates whose ASIN is in `passedAsins` are built (i.e., the set
 * returned by filterDuplicates().passed).
 *
 * @param raws        Full list of raw candidates for this category
 * @param passedAsins ASINs cleared by the deduplicator
 * @param startSeq    First sequential number for ID generation (e.g. 1 → "d01")
 * @param now         ISO 8601 timestamp
 */
export function buildCandidateBatch(
  raws:        DiscoveryCandidate[],
  passedAsins: Set<string>,
  startSeq:    number,
  now:         string,
): CandidateRecord[] {
  const cleared = raws.filter(r => passedAsins.has(r.asin))
  return cleared.map((raw, i) => {
    const prefix  = CATEGORY_ID_PREFIX[raw.category] ?? raw.category.slice(0, 4)
    const seq     = String(startSeq + i).padStart(2, '0')
    const id      = `${prefix}-d${seq}`
    return buildCandidateRecord(raw, id, now)
  })
}
