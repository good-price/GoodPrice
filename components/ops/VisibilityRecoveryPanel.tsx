/**
 * components/ops/VisibilityRecoveryPanel.tsx
 *
 * Shows recovery candidates sorted by priority with engagement scores
 * and indicates whether each can be recovered without PA-API.
 * Server component — no client JS.
 */

import type { RecoveryCandidate } from '@/lib/catalog/stabilization/types'

interface Props {
  candidates: RecoveryCandidate[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_BADGE: Record<string, { label: string; cls: string }> = {
  immediate: { label: 'Inmediato', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  high:      { label: 'Alto',      cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  medium:    { label: 'Medio',     cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  low:       { label: 'Bajo',      cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

const TIER_BADGE: Record<string, string> = {
  suppressed: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  degraded:   'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  warning:    'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
  active:     'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
}

function EngagementBar({ score }: { score: number }) {
  const colour = score >= 60 ? 'bg-blue-500' : score >= 30 ? 'bg-blue-400' : 'bg-gray-300 dark:bg-gray-600'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-400 tabular-nums">{score}</span>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VisibilityRecoveryPanel({ candidates }: Props) {
  if (candidates.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
          Candidatos de recuperación
        </h3>
        <p className="text-sm text-gray-500">
          No se encontraron productos recuperables en este momento. 🎉
        </p>
      </div>
    )
  }

  const immediateCount = candidates.filter(c => c.priority === 'immediate').length
  const highCount      = candidates.filter(c => c.priority === 'high').length

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Candidatos de recuperación
        </h3>
        <div className="flex gap-2 text-xs">
          {immediateCount > 0 && (
            <span className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full">
              {immediateCount} inmediato{immediateCount !== 1 ? 's' : ''}
            </span>
          )}
          {highCount > 0 && (
            <span className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 px-2 py-0.5 rounded-full">
              {highCount} alto{highCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-gray-400">{candidates.length} total</span>
        </div>
      </div>

      <div className="space-y-2.5">
        {candidates.map(c => {
          const pb = PRIORITY_BADGE[c.priority] ?? PRIORITY_BADGE.low
          const fromBadge = TIER_BADGE[c.currentTier] ?? ''
          const toBadge   = TIER_BADGE[c.targetTier]  ?? ''

          return (
            <div
              key={c.productId}
              className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${pb.cls}`}>
                      {pb.label}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${fromBadge}`}>
                      {c.currentTier}
                    </span>
                    <span className="text-xs text-gray-400">→</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${toBadge}`}>
                      {c.targetTier}
                    </span>
                    {c.canRecoverWithoutPaapi && (
                      <span className="text-xs text-blue-500">sin PA-API</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-snug line-clamp-2">
                    {c.reason}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs font-mono text-gray-400">{c.asin}</span>
                  <EngagementBar score={c.engagementScore} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
