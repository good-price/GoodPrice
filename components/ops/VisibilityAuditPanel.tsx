/**
 * components/ops/VisibilityAuditPanel.tsx
 *
 * Displays current catalog visibility breakdown with tier bars and alerts.
 * Shows trends and fires alerts when suppression exceeds 40% or visible < 60%.
 *
 * 'use client' — re-fetches on interval.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import type { VisibilityAuditResult }        from '@/lib/ops/activation/types'

interface Props {
  initial?: VisibilityAuditResult | null
}

const TIER_CONFIG = [
  { key: 'active' as const,    label: 'Active',    color: 'bg-green-500',  text: 'text-green-400'  },
  { key: 'warning' as const,   label: 'Warning',   color: 'bg-yellow-500', text: 'text-yellow-400' },
  { key: 'degraded' as const,  label: 'Degraded',  color: 'bg-orange-500', text: 'text-orange-400' },
  { key: 'suppressed' as const,label: 'Suprimidos',color: 'bg-red-500',    text: 'text-red-400'    },
]

const STATUS_BADGE: Record<string, string> = {
  healthy:          'bg-green-900/40 text-green-300 border-green-800',
  degraded:         'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  critical:         'bg-red-900/40 text-red-300 border-red-800',
  'over-suppressed':'bg-purple-900/40 text-purple-300 border-purple-800',
}

const STATUS_LABEL: Record<string, string> = {
  healthy:          '✓ Saludable',
  degraded:         '⚠ Degradado',
  critical:         '✕ Crítico',
  'over-suppressed':'✕ Sobresuprimido',
}

const POLL_INTERVAL = 15_000

export function VisibilityAuditPanel({ initial = null }: Props) {
  const [audit, setAudit] = useState<VisibilityAuditResult | null>(initial)

  const fetchAudit = useCallback(async () => {
    try {
      const res  = await fetch('/api/ops/recovery/status', { cache: 'no-store' })
      const data = await res.json() as { ok: boolean; audit: VisibilityAuditResult }
      if (data.ok) setAudit(data.audit)
    } catch { /* fail silently */ }
  }, [])

  useEffect(() => {
    const id = setInterval(fetchAudit, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchAudit])

  if (!audit) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-[11px] text-gray-600 text-center py-4">Cargando auditoría…</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div>
          <h3 className="text-sm font-bold text-gray-100">Visibility Audit</h3>
          <p className="text-[10px] text-gray-500">{audit.total} productos · {audit.visiblePct}% visibles</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${STATUS_BADGE[audit.status] ?? STATUS_BADGE.healthy}`}>
          {STATUS_LABEL[audit.status] ?? audit.status}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Alerts */}
        {audit.alerts.length > 0 && (
          <div className="space-y-1.5">
            {audit.alerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
                <span className="text-yellow-400 flex-shrink-0">⚠</span>
                <p className="text-[11px] text-yellow-300">{alert}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tier bars */}
        <div className="space-y-2.5">
          {TIER_CONFIG.map(({ key, label, color, text }) => {
            const count = audit[key]
            const pct   = audit.total > 0 ? Math.round((count / audit.total) * 100) : 0
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400 font-medium">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold tabular-nums ${text}`}>{count}</span>
                    <span className="text-[9px] text-gray-600">{pct}%</span>
                  </div>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`${color} h-1.5 rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-800">
          <div className="text-center">
            <p className="text-[10px] text-gray-600">Visibles</p>
            <p className={`text-lg font-black tabular-nums ${audit.visiblePct >= 60 ? 'text-green-400' : 'text-yellow-400'}`}>
              {audit.visiblePct}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-gray-600">Suprimidos</p>
            <p className={`text-lg font-black tabular-nums ${audit.suppressedPct > 40 ? 'text-red-400' : 'text-gray-400'}`}>
              {audit.suppressedPct}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-gray-600">Active ratio</p>
            <p className={`text-lg font-black tabular-nums ${audit.activeRatio >= 50 ? 'text-green-400' : 'text-yellow-400'}`}>
              {audit.activeRatio}%
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
