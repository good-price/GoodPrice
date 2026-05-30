/**
 * components/ops/RecoveryMetricsPanel.tsx
 *
 * Shows before/after recovery comparison metrics.
 * Displays recovered/suppressed counts and health score delta.
 *
 * 'use client' — reads from activation report.
 */

'use client'

import { useState, useCallback } from 'react'
import type { RecoveryRun, RecoveryImpact } from '@/lib/ops/activation/types'

interface Props {
  initialRun?:    RecoveryRun | null
  initialImpact?: RecoveryImpact | null
}

function DeltaBadge({ value, inverse = false }: { value: number; inverse?: boolean }) {
  const isGood = inverse ? value <= 0 : value >= 0
  if (value === 0) return <span className="text-gray-600 text-sm">→ 0</span>
  return (
    <span className={`text-sm font-bold ${isGood ? 'text-green-400' : 'text-red-400'}`}>
      {value > 0 ? '+' : ''}{value}
    </span>
  )
}

function MetricCard({
  label, value, unit = '', sub, accent = false,
}: {
  label:    string
  value:    number | string
  unit?:    string
  sub?:     string
  accent?:  boolean
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3 text-center">
      <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-black tabular-nums ${accent ? 'text-green-400' : 'text-gray-200'}`}>
        {value}{unit}
      </p>
      {sub && <p className="text-[9px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

export function RecoveryMetricsPanel({ initialRun = null, initialImpact = null }: Props) {
  const [run,    setRun]    = useState<RecoveryRun | null>(initialRun)
  const [impact, setImpact] = useState<RecoveryImpact | null>(initialImpact)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/ops/recovery/report', { cache: 'no-store' })
      const data = await res.json() as {
        ok: boolean
        report: {
          lastCompletedRun: RecoveryRun | null
          impact:           RecoveryImpact | null
        }
      }
      if (data.ok) {
        setRun(data.report.lastCompletedRun)
        setImpact(data.report.impact)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  if (!run || !run.before) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-bold text-gray-100">Recovery Metrics</h3>
          <p className="text-[10px] text-gray-500">Comparación antes / después</p>
        </div>
        <div className="p-4 text-center">
          <p className="text-[11px] text-gray-600 py-4">Sin recovery ejecutado aún.</p>
          <p className="text-[10px] text-gray-700">
            Los métricas se mostrarán después del primer Recovery Catalog.
          </p>
        </div>
      </div>
    )
  }

  const before      = run.before
  const after       = run.after
  const visibleBefore = before ? before.active + before.warning + before.degraded : 0
  const visibleAfter  = after  ? after.active  + after.warning  + after.degraded  : 0

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div>
          <h3 className="text-sm font-bold text-gray-100">Recovery Metrics</h3>
          <p className="text-[10px] text-gray-500">
            {run.startedAt ? new Date(run.startedAt).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${run.status === 'completed' ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>
            {run.status === 'completed' ? '✓' : '✕'} {run.status}
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            {loading ? '⟳' : '↻'}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Before / After grid */}
        <div>
          <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Visibilidad</p>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="Antes" value={visibleBefore} sub={`${before?.suppressed ?? 0} suprimidos`} />
            <MetricCard label="Después" value={visibleAfter} sub={`${after?.suppressed ?? 0} suprimidos`} accent={visibleAfter > visibleBefore} />
          </div>
        </div>

        {/* Impact metrics */}
        {impact && (
          <div>
            <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Impacto</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Visibles</span>
                <DeltaBadge value={impact.visibleDelta} />
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Suprimidos</span>
                <DeltaBadge value={impact.suppressedDelta} inverse />
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Active</span>
                <DeltaBadge value={impact.activeDelta} />
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Health</span>
                <DeltaBadge value={impact.healthDelta} />
              </div>
            </div>
          </div>
        )}

        {/* Tier breakdown */}
        {after && (
          <div>
            <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Distribución final</p>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {[
                { label: 'Active',    count: after.active,    cls: 'text-green-400'  },
                { label: 'Warning',   count: after.warning,   cls: 'text-yellow-400' },
                { label: 'Degraded',  count: after.degraded,  cls: 'text-orange-400' },
                { label: 'Suprimido', count: after.suppressed, cls: 'text-red-400'   },
              ].map(({ label, count, cls }) => (
                <div key={label} className="bg-gray-800/40 rounded-lg p-2">
                  <p className={`text-base font-black tabular-nums ${cls}`}>{count}</p>
                  <p className="text-[8px] text-gray-600">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
