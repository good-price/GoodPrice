/**
 * lib/catalog/live-truth/pricing-validator.ts
 *
 * Validates live Amazon prices against the catalog's stored prices and detects:
 *   - Stale catalog prices (diverged from live Amazon)
 *   - Fake discounts (implausibly high "was" prices)
 *   - Impossible discount percentages
 *
 * Score (max 25):
 *   |delta| ≤  5%  → 25 pts  (excellent match)
 *   |delta| ≤ 15%  → 22 pts  (normal price fluctuation)
 *   |delta| ≤ 35%  → 15 pts  (notable drift)
 *   |delta| ≤ 60%  → 8 pts   (significant drift — update needed)
 *   |delta|  > 60% → 2 pts   (extreme drift)
 *   Not extractable          → 12 pts (neutral — cannot penalise)
 *
 * Fake-discount heuristic:
 *   discount% > 65% is flagged (extremely rare for legitimate deals).
 *   The threshold is intentionally conservative to avoid false positives.
 */

import type { PricingValidation } from './types'

const MAX_SCORE = 25

function deltaScore(absDeltaPct: number): number {
  if (absDeltaPct <=  5) return 25
  if (absDeltaPct <= 15) return 22
  if (absDeltaPct <= 35) return 15
  if (absDeltaPct <= 60) return 8
  return 2
}

/** Threshold above which a discount is considered suspiciously large */
const FAKE_DISCOUNT_THRESHOLD_PCT = 65

export function validatePricing(
  catalogPriceUSD: number,
  livePrice:       number | undefined,
  oldPriceLive:    number | undefined,
): PricingValidation {
  // ── No live price available ───────────────────────────────────────────────
  if (!livePrice || livePrice <= 0) {
    return {
      score:           Math.round(MAX_SCORE * 0.48),
      catalogPriceUSD,
      reason:          'Precio no extraído — sin penalización',
      hasFakeDiscount: false,
    }
  }

  // ── Price delta ───────────────────────────────────────────────────────────
  const deltaPct    = ((livePrice - catalogPriceUSD) / catalogPriceUSD) * 100
  const absDeltaPct = Math.abs(deltaPct)
  const score       = deltaScore(absDeltaPct)

  // ── Fake discount detection ───────────────────────────────────────────────
  let hasFakeDiscount = false
  let discountPct: number | undefined

  if (oldPriceLive && oldPriceLive > livePrice) {
    discountPct = ((oldPriceLive - livePrice) / oldPriceLive) * 100
    if (discountPct > FAKE_DISCOUNT_THRESHOLD_PCT) {
      hasFakeDiscount = true
    }
  }

  // Build reason string
  let reason: string
  if (absDeltaPct <= 5)        reason = `Precio OK (Δ ${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`
  else if (deltaPct < -15)     reason = `Precio más bajo en Amazon ahora (Δ ${deltaPct.toFixed(1)}%) — actualizar`
  else if (deltaPct > 15)      reason = `Precio más alto en Amazon ahora (Δ +${deltaPct.toFixed(1)}%) — actualizar`
  else                         reason = `Fluctuación normal (Δ ${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`

  if (hasFakeDiscount && discountPct !== undefined) {
    reason += ` · POSIBLE DESCUENTO FALSO (${discountPct.toFixed(0)}% off implica precio "antes" inflado)`
  }

  return {
    score,
    catalogPriceUSD,
    livePrice,
    deltaPct,
    hasFakeDiscount,
    discountPct,
    reason,
  }
}
