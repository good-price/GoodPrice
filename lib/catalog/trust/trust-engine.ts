/**
 * lib/catalog/trust/trust-engine.ts
 *
 * Orchestrates the suppression and degradation engines to compute
 * a product's final visibility tier.
 *
 * Logic:
 *   1. Evaluate suppression signals (gate-1 through gate-11*)
 *   2. If any suppression signal → tier = 'suppressed'
 *   3. Otherwise evaluate degradation signals
 *   4. Worst degradation tier wins (degraded > warning > active)
 *   5. Generate warning badges from all signals
 *   6. Compute confidence from all signals
 *
 * SERVER-ONLY.
 */

import type { Product }                from '@/types'
import type {
  VisibilityTier,
  VisibilitySignal,
  VisibilityResult,
  VisibilityContext,
  WarningBadge,
  ConfidenceLevel,
} from './types'
import { evaluateSuppressionSignals }  from './suppression-engine'
import { evaluateDegradationSignals }  from './degradation-engine'
import { computeConfidence }           from './confidence-engine'
import { generateWarningBadges }       from './warning-badges'
import { computePublicScore }          from './public-score'

// ── Tier ranking ──────────────────────────────────────────────────────────────

const TIER_RANK: Record<VisibilityTier, number> = {
  active:     0,
  warning:    1,
  degraded:   2,
  suppressed: 3,
}

function worstTier(tiers: VisibilityTier[]): VisibilityTier {
  if (tiers.length === 0) return 'active'
  return tiers.reduce((a, b) => TIER_RANK[a] >= TIER_RANK[b] ? a : b)
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Computes full visibility result for a single product.
 */
export function computeTier(
  product: Product,
  context: VisibilityContext,
): {
  tier:             VisibilityTier
  signals:          VisibilitySignal[]
  warnings:         WarningBadge[]
  confidence:       ConfidenceLevel
  publicScore:      number
  suppressionReason: string | null
} {
  // Step 1: check suppression gates
  const suppressionSignals = evaluateSuppressionSignals(product, context)

  if (suppressionSignals.length > 0) {
    // Product is suppressed — no need to check degradation
    const confidence    = computeConfidence(suppressionSignals)
    const publicScore   = computePublicScore(product, context)
    const primaryReason = suppressionSignals[0].reason

    return {
      tier:             'suppressed',
      signals:          suppressionSignals,
      warnings:         [],   // no badges shown for suppressed products
      confidence,
      publicScore:      Math.min(publicScore, 30),  // cap suppressed at 30
      suppressionReason: primaryReason,
    }
  }

  // Step 2: check degradation gates
  const degradationSignals = evaluateDegradationSignals(product, context)
  const allSignals         = degradationSignals  // suppression signals are empty

  const tier = worstTier(
    degradationSignals.length > 0
      ? degradationSignals.map(s => s.tier)
      : ['active'],
  )

  const confidence    = computeConfidence(allSignals)
  const warnings      = tier !== 'active' ? generateWarningBadges(allSignals) : []
  const publicScore   = computePublicScore(product, context)

  return {
    tier,
    signals:          allSignals,
    warnings,
    confidence,
    publicScore,
    suppressionReason: null,
  }
}

/**
 * Builds a complete VisibilityResult for a product.
 * This is the main entry point for individual product visibility checks.
 */
export function computeProductTier(
  product: Product,
  context: VisibilityContext,
): VisibilityResult {
  const { tier, signals, warnings, confidence, publicScore, suppressionReason } =
    computeTier(product, context)

  return {
    productId:         product.id ?? '',
    tier,
    publicScore,
    signals,
    warnings,
    isPublic:          tier !== 'suppressed',
    confidence,
    suppressionReason,
    computedAt:        new Date().toISOString(),
  }
}
