/**
 * lib/tpe/discovery/deduplicator.ts
 *
 * Sprint 5A — Discovery Lite
 *
 * Prevents duplicate candidates from entering the Candidate Pool.
 *
 * Three deduplication layers (checked in order, first match wins):
 *
 *   1. ASIN   — exact match against any pool candidate (any status, any lifecycle).
 *               ASINs are immutable product identifiers — a candidate with the same
 *               ASIN already exists in the system.
 *
 *   2. Title  — normalized title match against all pool candidates.
 *               Normalization: lowercase, strip non-alphanumeric, collapse spaces.
 *               Catches re-submissions of the same product with minor title edits.
 *
 *   3. Batch  — ASIN uniqueness within the current discovery batch itself.
 *               Prevents a single run from inserting the same ASIN twice if the
 *               source emits duplicates.
 *
 * The deduplicator is a pure function: it reads from the pool but never writes.
 * Callers are responsible for the actual pool write after filtering.
 */

import type { CandidateRecord, DiscoveryCandidate } from '@/types'
import type { DedupResult } from './discovery-types'

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Normalize a title for fuzzy deduplication.
 * Strips punctuation/special chars, lowercases, collapses spaces.
 * "Dyson Supersonic HD08 — 1600W" → "dyson supersonic hd08 1600w"
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')  // non-alphanumeric → space
    .replace(/\s+/g, ' ')           // collapse runs of spaces
    .trim()
}

// ── Main filter ───────────────────────────────────────────────────────────────

/**
 * Filter a list of raw discovery candidates against the existing pool.
 *
 * Returns:
 *   passed  — ASINs that cleared all dedup checks (safe to insert)
 *   blocked — ASINs rejected, with the reason and a human-readable detail
 *
 * The pool is read once; callers should pass the full pool snapshot to avoid
 * multiple reads during batch processing.
 */
export function filterDuplicates(
  candidates: DiscoveryCandidate[],
  pool:       CandidateRecord[],
): DedupResult {
  // Build lookup sets from the pool (read once, O(1) lookups)
  const poolAsinSet  = new Set(pool.map(c => c.asin))
  const poolTitleSet = new Set(pool.map(c => normalizeTitle(c.title)))

  const passed:  string[] = []
  const blocked: DedupResult['blocked'] = []

  // Track ASINs and titles seen within this batch to catch intra-batch dupes
  const batchAsins  = new Set<string>()
  const batchTitles = new Set<string>()

  for (const cand of candidates) {
    const normalTitle = normalizeTitle(cand.title)

    // ── Layer 3: intra-batch ASIN dedup ──────────────────────────────────────
    if (batchAsins.has(cand.asin)) {
      blocked.push({
        asin:   cand.asin,
        reason: 'asin',
        detail: `ASIN ${cand.asin} appears more than once in this discovery batch`,
      })
      continue
    }

    // ── Layer 1: pool ASIN dedup ──────────────────────────────────────────────
    if (poolAsinSet.has(cand.asin)) {
      blocked.push({
        asin:   cand.asin,
        reason: 'asin',
        detail: `ASIN ${cand.asin} already present in candidate pool`,
      })
      continue
    }

    // ── Layer 2: pool title dedup ─────────────────────────────────────────────
    if (poolTitleSet.has(normalTitle)) {
      blocked.push({
        asin:   cand.asin,
        reason: 'title',
        detail: `Normalized title already in pool: "${normalTitle.slice(0, 70)}"`,
      })
      continue
    }

    // ── Layer 2b: intra-batch title dedup ─────────────────────────────────────
    if (batchTitles.has(normalTitle)) {
      blocked.push({
        asin:   cand.asin,
        reason: 'title',
        detail: `Normalized title already added in this batch: "${normalTitle.slice(0, 70)}"`,
      })
      continue
    }

    // ── Cleared all layers ────────────────────────────────────────────────────
    passed.push(cand.asin)
    batchAsins.add(cand.asin)
    batchTitles.add(normalTitle)
    poolAsinSet.add(cand.asin)    // prevent same ASIN passing twice via pool check
    poolTitleSet.add(normalTitle) // prevent same title passing twice via pool check
  }

  return { passed, blocked }
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Quick check: is a single ASIN already in the pool?
 * Avoids a full filterDuplicates() call when checking one candidate.
 */
export function isAsinInPool(asin: string, pool: CandidateRecord[]): boolean {
  return pool.some(c => c.asin === asin)
}
