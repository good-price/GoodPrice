/**
 * lib/catalog/stabilization/degraded-priority.ts
 *
 * Prioritizes recovery candidates for the stabilization layer.
 *
 * Recovery priority ordering:
 *   immediate — suppressed product with high engagement (clicks) and recoverable gate
 *   high      — suppressed product with recoverable gate
 *   medium    — degraded product with clear recovery path
 *   low       — degraded product with uncertain recovery
 *
 * Engagement score (0–100) is derived from product click analytics.
 * Products with more clicks are prioritized so high-traffic products
 * recover first.
 *
 * SERVER-ONLY.
 */

import { getAllProducts }            from '@/data/catalog'
import { computeCatalogVisibility } from '@/lib/catalog/trust/visibility-engine'
import { findRecoveryCandidates }   from '@/lib/catalog/trust/recovery-engine'
import { buildVisibilityContext }   from '@/lib/catalog/trust/visibility-engine'
import { getTopProducts }           from '@/lib/analytics'
import type { RecoveryCandidate, RecoveryPriority } from './types'
import type { ConfidenceLevel }     from '@/lib/catalog/trust/types'

// ── Engagement score ───────────────────────────────────────────────────────────

async function buildEngagementMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  try {
    const stats = await getTopProducts(10_000)
    if (!stats.length) return map

    const maxClicks = Math.max(...stats.map(s => s.clicks), 1)
    for (const s of stats) {
      const score = Math.round((s.clicks / maxClicks) * 100)
      map.set(s.productId, score)
    }
  } catch { /* analytics unavailable — proceed without engagement */ }
  return map
}

// ── Priority assignment ────────────────────────────────────────────────────────

function assignPriority(
  tier:       'suppressed' | 'degraded' | 'warning' | 'active',
  confidence: ConfidenceLevel,
  engagement: number,
): RecoveryPriority {
  if (tier === 'suppressed') {
    if (engagement >= 50) return 'immediate'
    if (confidence === 'medium' || confidence === 'high') return 'high'
    return 'medium'
  }
  if (tier === 'degraded') {
    if (confidence === 'high' || confidence === 'medium') return 'medium'
    return 'low'
  }
  return 'low'
}

function canRecoverWithoutPaapi(targetTier: string): boolean {
  // Recovery to 'warning' or 'degraded' does not require PA-API data
  // Recovery to 'active' may require a full PAAPI sync for fresh image + title
  return targetTier !== 'active'
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns prioritized recovery candidates for the stabilization report.
 * Limited to top 20 to keep the report concise.
 */
export async function buildPrioritizedRecoveryCandidates(
  maxCandidates = 20,
): Promise<RecoveryCandidate[]> {
  const products       = getAllProducts()
  const results        = computeCatalogVisibility(products)
  const context        = buildVisibilityContext()
  const trustCandidates = findRecoveryCandidates(products, results, context)
  const engagement     = await buildEngagementMap()

  const stabilCandidates: RecoveryCandidate[] = trustCandidates.map(tc => {
    const engagementScore = engagement.get(tc.productId) ?? 0
    const priority        = assignPriority(
      tc.currentTier as 'suppressed' | 'degraded' | 'warning' | 'active',
      tc.confidence,
      engagementScore,
    )

    return {
      productId:              tc.productId,
      asin:                   tc.asin,
      currentTier:            tc.currentTier,
      targetTier:             tc.targetTier,
      priority,
      reason:                 tc.reason,
      canRecoverWithoutPaapi: canRecoverWithoutPaapi(tc.targetTier),
      engagementScore,
    }
  })

  // Sort: immediate → high → medium → low, then by engagement desc
  const priorityRank: Record<RecoveryPriority, number> = {
    immediate: 0, high: 1, medium: 2, low: 3,
  }

  stabilCandidates.sort((a, b) => {
    const pd = priorityRank[a.priority] - priorityRank[b.priority]
    if (pd !== 0) return pd
    return b.engagementScore - a.engagementScore
  })

  return stabilCandidates.slice(0, maxCandidates)
}
