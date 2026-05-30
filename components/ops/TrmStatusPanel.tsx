/**
 * components/ops/TrmStatusPanel.tsx
 *
 * Monitors the TRM (Tasa Representativa del Mercado) USD→COP exchange rate.
 * Alerts when rate is stale (>24h) or using a hardcoded fallback.
 * All COP price conversions use this rate.
 *
 * 'use client' — interactive update action.
 */

'use client'

import { useState, useCallback } from 'react'
import type { TrmMonitorStatus }  from '@/lib/ops/activation/types'

interface Props {
  initial?: TrmMonitorStatus | null
}

const FRESHNESS_CONFIG = {
  fresh:   { cls: 'text-green-400', label: 'Fresca' },
  aging:   { cls: 'text-yellow-400', label: 'Envejeciendo' },
  stale:   { cls: 'text-red-400', label: 'Desactualizada' },
  unknown: { cls: 'text-gray-500', label: 'Desconocida' },
} as const

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`
  return `${Math.floor(ms / 86_400_000)}d`
}

export function TrmStatusPanel({ initial = null }: Props) {
  const [trm,      setTrm]      = useState<TrmMonitorStatus | null>(initial)
  const [loading,  setLoading]  = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  const updateTrm = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const res  = await fetch('/api/currency/update', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      })
      const data = await res.json() as { ok: boolean; error?: string; rate?: number; source?: string }
      setFeedback({
        ok:      data.ok,
        message: data.ok
          ? `TRM actualizada: ${data.rate?.toLocaleString('es-CO')} COP/USD · fuente: ${data.source}`
          : (data.error ?? 'Error al actualizar TRM'),
      })
      // Refresh local state
      if (data.ok) {
        try {
          const r = await fetch('/api/ops/recovery/report', { cache: 'no-store' })
          const d = await r.json() as { ok: boolean; report: { trmStatus: TrmMonitorStatus } }
          if (d.ok) setTrm(d.report.trmStatus)
        } catch { /* ignore */ }
      }
    } catch {
      setFeedback({ ok: false, message: 'Error de red' })
    } finally {
      setLoading(false)
      setTimeout(() => setFeedback(null), 5000)
    }
  }, [])

  if (!trm) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-[11px] text-gray-600 text-center py-4">Cargando TRM…</p>
      </div>
    )
  }

  const freshConfig = FRESHNESS_CONFIG[trm.freshnessLabel] ?? FRESHNESS_CONFIG.unknown

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div>
          <h3 className="text-sm font-bold text-gray-100">TRM Monitor</h3>
          <p className="text-[10px] text-gray-500">USD → COP · Tipo de cambio</p>
        </div>
        <span className={`text-[10px] font-bold ${freshConfig.cls}`}>
          {freshConfig.label}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Rate display */}
        <div className="text-center">
          <p className={`text-3xl font-black tabular-nums ${trm.isFallback ? 'text-gray-500' : trm.alertStale ? 'text-yellow-400' : 'text-gray-100'}`}>
            {trm.rate.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5">COP por USD</p>
          {trm.isFallback && (
            <span className="text-[9px] bg-red-900/40 text-red-300 px-2 py-0.5 rounded-full border border-red-800 mt-1 inline-block">
              FALLBACK HARDCODED
            </span>
          )}
        </div>

        {/* Metadata */}
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Fuente</span>
            <span className="text-gray-300 font-medium">{trm.source}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Actualizado</span>
            <span className={`font-medium ${trm.alertStale ? 'text-yellow-400' : 'text-gray-300'}`}>
              {relTime(trm.fetchedAt)} atrás · {trm.ageHours}h
            </span>
          </div>
          {trm.expiresAt && (
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Vence</span>
              <span className={`font-medium ${trm.isStale ? 'text-red-400' : 'text-gray-400'}`}>
                {trm.isStale ? 'EXPIRADO' : relTime(trm.expiresAt) + ' restantes'}
              </span>
            </div>
          )}
        </div>

        {/* Alerts */}
        {(trm.alertStale || trm.alertFallback) && (
          <div className="space-y-1.5">
            {trm.alertFallback && (
              <div className="px-3 py-2 bg-red-900/20 border border-red-800/50 rounded-lg text-[10px] text-red-300">
                ⚠ TRM en fallback — los precios COP pueden ser incorrectos
              </div>
            )}
            {trm.alertStale && !trm.alertFallback && (
              <div className="px-3 py-2 bg-yellow-900/20 border border-yellow-800/50 rounded-lg text-[10px] text-yellow-300">
                ⚠ TRM desactualizada ({trm.ageHours}h) — actualiza antes de publicar precios
              </div>
            )}
          </div>
        )}

        {/* Update action */}
        <button
          onClick={updateTrm}
          disabled={loading}
          className="w-full py-2 rounded-lg text-[11px] font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 transition-colors"
        >
          {loading ? '⟳ Actualizando…' : '⟳ Actualizar TRM'}
        </button>

        {/* Feedback */}
        {feedback && (
          <div className={`px-3 py-2 rounded-lg text-[10px] ${feedback.ok ? 'bg-green-900/20 text-green-300' : 'bg-red-900/20 text-red-300'}`}>
            {feedback.ok ? '✓' : '✕'} {feedback.message}
          </div>
        )}
      </div>
    </div>
  )
}
