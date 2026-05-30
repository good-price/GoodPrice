/**
 * components/ops/PinnedMetrics.tsx
 *
 * Horizontal metrics strip pinned below the topbar.
 * Shows operator-selected KPIs; polls /api/ops/live every 10s.
 * 'use client' — polling + toggle interaction.
 */

'use client'

import { useState, useEffect, useCallback }           from 'react'
import type { OpsSnapshot, PinnedMetricValue }        from '@/lib/ops/workspace/types'
import { getPinnedMetricValues, METRIC_DEFS }         from '@/lib/ops/workspace/pinned-views'

// ── Color styles ──────────────────────────────────────────────────────────────

const COLOR_TEXT: Record<string, string> = {
  green:  'text-green-400',
  yellow: 'text-yellow-400',
  red:    'text-red-400',
  blue:   'text-blue-400',
  purple: 'text-purple-400',
  gray:   'text-gray-500',
}

// ── Metric chip ───────────────────────────────────────────────────────────────

function MetricChip({
  metric,
  onToggle,
}: {
  metric:   PinnedMetricValue
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="group flex items-center gap-1.5 px-3 h-full border-r border-gray-800 hover:bg-gray-800/50 transition-colors flex-shrink-0"
      title={`${metric.label}: ${metric.value}${metric.unit ?? ''}  · Click to unpin`}
    >
      <span className="text-[9px] font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap">
        {metric.label}
      </span>
      <span className={`text-[13px] font-bold tabular-nums ${COLOR_TEXT[metric.color] ?? 'text-gray-400'}`}>
        {metric.value}{metric.unit ?? ''}
      </span>
      {metric.trend === 'up' && <span className="text-[9px] text-green-400">↑</span>}
      {metric.trend === 'down' && <span className="text-[9px] text-red-400">↓</span>}
      <span className="text-[9px] text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">✕</span>
    </button>
  )
}

// ── Add metric picker ─────────────────────────────────────────────────────────

function MetricPicker({
  pinnedIds,
  onToggle,
  onClose,
}: {
  pinnedIds: string[]
  onToggle:  (id: string) => void
  onClose:   () => void
}) {
  return (
    <div className="absolute top-full right-0 mt-1 z-50 w-56 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-800">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pin métricas</p>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {METRIC_DEFS.map(def => {
          const pinned = pinnedIds.includes(def.id)
          return (
            <button
              key={def.id}
              onClick={() => { onToggle(def.id); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800 transition-colors"
            >
              <span className={`w-3 h-3 rounded-sm border ${pinned ? 'bg-blue-600 border-blue-600' : 'border-gray-600'} flex-shrink-0`}>
                {pinned && <span className="block text-white text-[8px] text-center leading-3">✓</span>}
              </span>
              <div>
                <p className="text-[11px] text-gray-200 font-medium">{def.label}</p>
                <p className="text-[9px] text-gray-500 leading-tight">{def.description}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  snapshot:    OpsSnapshot
  pinnedIds:   string[]
  onTogglePin: (id: string) => void
}

const POLL_INTERVAL = 10_000  // 10 seconds

export function PinnedMetrics({ snapshot: initialSnapshot, pinnedIds, onTogglePin }: Props) {
  const [snapshot,     setSnapshot]     = useState<OpsSnapshot>(initialSnapshot)
  const [pickerOpen,   setPickerOpen]   = useState(false)

  const metrics = getPinnedMetricValues(pinnedIds, snapshot)

  const fetchSnapshot = useCallback(async () => {
    try {
      const res  = await fetch('/api/ops/live', { cache: 'no-store' })
      const data = await res.json() as { ok: boolean; snapshot: OpsSnapshot }
      if (data.ok && data.snapshot) setSnapshot(data.snapshot)
    } catch { /* fail silently */ }
  }, [])

  useEffect(() => {
    const id = setInterval(fetchSnapshot, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchSnapshot])

  return (
    <div className="flex items-center h-[44px] bg-gray-900/60 border-b border-gray-800 overflow-x-auto scrollbar-none flex-shrink-0 relative">
      {metrics.map(metric => (
        <MetricChip
          key={metric.id}
          metric={metric}
          onToggle={() => onTogglePin(metric.id)}
        />
      ))}

      {/* Add / manage button */}
      <div className="ml-auto relative flex-shrink-0">
        <button
          onClick={() => setPickerOpen(v => !v)}
          className="h-[44px] px-3 text-gray-600 hover:text-gray-300 hover:bg-gray-800/50 transition-colors text-xs border-l border-gray-800"
          title="Gestionar métricas pinadas"
        >
          ⊕
        </button>
        {pickerOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setPickerOpen(false)}
            />
            <MetricPicker
              pinnedIds={pinnedIds}
              onToggle={onTogglePin}
              onClose={() => setPickerOpen(false)}
            />
          </>
        )}
      </div>
    </div>
  )
}
