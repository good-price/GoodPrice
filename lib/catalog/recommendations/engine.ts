/**
 * lib/catalog/recommendations/engine.ts
 *
 * computeRecommendationScore() — pure, no I/O — Sprint 4F.
 *
 * Score formula (0–100):
 *   base      = opportunity*0.35 + confidence*0.30 + quality*0.20
 *   trend     = falling:+15  rising:-10  stable:0
 *   lifecycle = healthy:+5   aging:-5   stale:-15  critical:-30
 *   result    = clamp(round(base + trend + lifecycle), 0, 100)
 *
 * Rationale:
 *   opportunity has the highest weight because a product near its price floor
 *   is the most immediately actionable signal.
 *   confidence and quality together represent reliability.
 *   falling trend is a BUY signal; rising trend is a cautionary flag.
 *   critical lifecycle means the product may disappear soon — strong penalty.
 *
 * SERVER-ONLY.
 */

import type { LifecycleHealth } from '@/lib/catalog/lifecycle/types'

export interface RecommendationInput {
  opportunityScore: number
  confidenceScore:  number
  qualityScore:     number
  trend:            'rising' | 'falling' | 'stable'
  lifecycleHealth:  LifecycleHealth
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function computeRecommendationScore(input: RecommendationInput): number {
  const { opportunityScore, confidenceScore, qualityScore, trend, lifecycleHealth } = input

  const base = opportunityScore * 0.35
             + confidenceScore  * 0.30
             + qualityScore     * 0.20

  const trendAdj =
    trend === 'falling' ?  15 :
    trend === 'rising'  ? -10 :
                           0

  const healthAdj =
    lifecycleHealth === 'healthy'  ?   5 :
    lifecycleHealth === 'aging'    ?  -5 :
    lifecycleHealth === 'stale'    ? -15 :
    /* critical */                   -30

  return clamp(Math.round(base + trendAdj + healthAdj), 0, 100)
}

/**
 * Builds the array of human-readable reasons explaining the score.
 * Returns strongest signals first.
 */
export function buildRecommendationReasons(input: RecommendationInput): string[] {
  const { opportunityScore, confidenceScore, qualityScore, trend, lifecycleHealth } = input
  const reasons: string[] = []

  // Opportunity signals
  if (opportunityScore >= 75) reasons.push('Precio en mínimo histórico')
  else if (opportunityScore >= 50) reasons.push('Precio cerca de mínimo histórico')

  // Trend signals
  if (trend === 'falling') reasons.push('Precio bajando — buen momento de compra')
  else if (trend === 'rising') reasons.push('Precio subiendo — posible alza próxima')

  // Confidence / quality signals
  if (confidenceScore >= 70) reasons.push('Alta confianza en el dato')
  else if (confidenceScore < 35) reasons.push('Confianza baja — verificar disponibilidad')

  if (qualityScore >= 70) reasons.push('Producto de alta calidad en catálogo')

  // Lifecycle signals
  if (lifecycleHealth === 'healthy') reasons.push('Producto validado recientemente')
  else if (lifecycleHealth === 'aging')    reasons.push('Requiere actualización pronto')
  else if (lifecycleHealth === 'stale')    reasons.push('Datos desactualizados — programar revisión')
  else if (lifecycleHealth === 'critical') reasons.push('Ciclo de vida crítico — candidato a reemplazo')

  return reasons
}
