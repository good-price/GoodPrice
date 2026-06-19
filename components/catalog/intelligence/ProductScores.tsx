/**
 * components/catalog/intelligence/ProductScores.tsx
 *
 * Renders intelligence score bars for a product.
 * Server Component — no hooks, no client state.
 */

interface Props {
  recommendationScore: number
  opportunityScore:    number
  confidenceScore:     number
  qualityScore:        number
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-gray-500 w-28 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.max(2, value)}%` }}
          aria-label={`${value} de 100`}
        />
      </div>
      <span className="text-gray-400 w-8 text-right tabular-nums">{value}</span>
    </div>
  )
}

export function ProductScores({
  recommendationScore, opportunityScore, confidenceScore, qualityScore,
}: Props) {
  // Don't render if all scores are zero (no intelligence data yet)
  if (recommendationScore + opportunityScore + confidenceScore + qualityScore === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Inteligencia GOODPRICE
      </p>
      <div className="space-y-1.5">
        <ScoreBar label="Recomendación"  value={recommendationScore} color="bg-amber-400" />
        <ScoreBar label="Oportunidad"    value={opportunityScore}    color="bg-green-400" />
        <ScoreBar label="Confianza"      value={confidenceScore}     color="bg-blue-400" />
        <ScoreBar label="Calidad"        value={qualityScore}        color="bg-purple-400" />
      </div>
    </div>
  )
}
