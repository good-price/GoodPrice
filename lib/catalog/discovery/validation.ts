/**
 * lib/catalog/discovery/validation.ts
 *
 * Catalog Pipeline — Validation phase (Sprint 3F).
 *
 * Validates CatalogCandidate[] against hard constraints and a soft score.
 * Does NOT admit products or write to any catalog file.
 *
 * Hard checks (fail → candidate is silently discarded):
 *   1. ASIN format — must be exactly 10 chars, A-Z0-9
 *   2. Not a duplicate — ASIN must not exist in existingAsins
 *   3. Category valid — must be one of the 10 GOODPRICE slugs
 *
 * Soft scoring (0–100, candidate passes if score ≥ 60):
 *   Image URL present          +30
 *   Ships to Colombia          +25
 *   Price > 0                  +20
 *   Rating ≥ 4.0               +25
 *
 * SERVER-ONLY.
 */

import type { CatalogCandidate, DiscoveryContext } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const ASIN_RE = /^[A-Z0-9]{10}$/

const VALID_CATS = new Set([
  'electronica',
  'gaming',
  'hogar',
  'cocina',
  'deporte',
  'oficina',
  'belleza',
  'mascotas',
  'bebes',
  'herramientas',
])

const PASSING_SCORE = 60

// ── Internal validator ────────────────────────────────────────────────────────

function validateCandidate(
  c: CatalogCandidate,
  existingAsins: Set<string>,
): CatalogCandidate | null {
  // Hard checks — any failure → reject
  if (!ASIN_RE.test(c.asin))           return null
  if (existingAsins.has(c.asin))       return null
  if (!VALID_CATS.has(c.category))     return null

  // Soft scoring
  let score = 0
  const reasons = [...c.reasons]

  if (c.image && c.image.startsWith('http')) {
    score += 30
    reasons.push('URL de imagen válida (+30)')
  }

  if (c.shipsToColombiaConfirmed) {
    score += 25
    reasons.push('Envía a Colombia (+25)')
  }

  if (c.price > 0) {
    score += 20
    reasons.push(`Precio $${c.price.toFixed(2)} (+20)`)
  }

  if (c.rating >= 4.0) {
    score += 25
    reasons.push(`Rating ${c.rating.toFixed(1)} ≥ 4.0 (+25)`)
  }

  const validationScore = Math.min(100, score)
  if (validationScore < PASSING_SCORE) return null

  return { ...c, validationScore, reasons }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validates candidates. Returns only those that pass all hard checks
 * and achieve a validationScore ≥ 60.
 *
 * Does NOT write to any file.
 * Never throws.
 */
export function validateCatalogCandidates(
  candidates: CatalogCandidate[],
  context: DiscoveryContext,
  existingAsins: Set<string>,
): CatalogCandidate[] {
  try {
    const result: CatalogCandidate[] = []
    for (const c of candidates) {
      const validated = validateCandidate(c, existingAsins)
      if (validated) result.push(validated)
    }
    // Suppress unused-parameter warning — context reserved for future per-category rules
    void context
    return result
  } catch {
    return []
  }
}
