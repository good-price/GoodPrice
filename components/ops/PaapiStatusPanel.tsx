/**
 * components/ops/PaapiStatusPanel.tsx
 *
 * Shows PA-API readiness status — configured/missing credentials,
 * recoverable products, and image recovery opportunity.
 *
 * 'use client' — interactive.
 */

'use client'

import { useState, useCallback } from 'react'
import type { PaapiReadiness }    from '@/lib/ops/activation/types'

interface Props {
  initial?: PaapiReadiness | null
}

export function PaapiStatusPanel({ initial = null }: Props) {
  const [paapi,    setPaapi]    = useState<PaapiReadiness | null>(initial)
  const [loading,  setLoading]  = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  const runSync = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const res  = await fetch('/api/paapi/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ operator: 'admin' }),
      })
      const data = await res.json() as { ok: boolean; error?: string; updated?: number }
      setFeedback({
        ok:      data.ok,
        message: data.ok
          ? `${data.updated ?? 0} imágenes actualizadas vía PA-API`
          : (data.error ?? 'Error al sincronizar'),
      })
      // Refresh data
      try {
        const r = await fetch('/api/ops/recovery/report', { cache: 'no-store' })
        const d = await r.json() as { ok: boolean; report: { paapiReadiness: PaapiReadiness } }
        if (d.ok) setPaapi(d.report.paapiReadiness)
      } catch { /* ignore */ }
    } catch {
      setFeedback({ ok: false, message: 'Error de red' })
    } finally {
      setLoading(false)
      setTimeout(() => setFeedback(null), 5000)
    }
  }, [])

  if (!paapi) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-[11px] text-gray-600 text-center py-4">Cargando estado PA-API…</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div>
          <h3 className="text-sm font-bold text-gray-100">PA-API Readiness</h3>
          <p className="text-[10px] text-gray-500">Imágenes oficiales Amazon</p>
        </div>
        <span className={[
          'text-[10px] font-bold px-2 py-0.5 rounded border',
          paapi.configured
            ? 'bg-green-900/40 text-green-300 border-green-800'
            : 'bg-red-900/40 text-red-300 border-red-800',
        ].join(' ')}>
          {paapi.configured ? '✓ Configurado' : '✕ Sin configurar'}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-black tabular-nums text-gray-300">{paapi.totalImages}</p>
            <p className="text-[9px] text-gray-600 uppercase tracking-wide">Total</p>
          </div>
          <div>
            <p className="text-2xl font-black tabular-nums text-green-400">{paapi.freshImages}</p>
            <p className="text-[9px] text-gray-600 uppercase tracking-wide">Frescas</p>
          </div>
          <div>
            <p className={`text-2xl font-black tabular-nums ${paapi.staleImages > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
              {paapi.staleImages}
            </p>
            <p className="text-[9px] text-gray-600 uppercase tracking-wide">Stale</p>
          </div>
        </div>

        {/* Recovery progress bar */}
        {paapi.totalImages > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-500">Calidad de imágenes</span>
              <span className={`text-[10px] font-bold ${paapi.imageRecoveryPct >= 80 ? 'text-green-400' : paapi.imageRecoveryPct >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                {paapi.imageRecoveryPct}%
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full transition-all ${paapi.imageRecoveryPct >= 80 ? 'bg-green-500' : paapi.imageRecoveryPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${paapi.imageRecoveryPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Recommendation */}
        {paapi.recommendation && (
          <div className="px-3 py-2 bg-blue-900/20 border border-blue-800/50 rounded-lg">
            <p className="text-[10px] text-blue-300">💡 {paapi.recommendation}</p>
          </div>
        )}

        {/* Actions */}
        {paapi.configured && paapi.staleImages > 0 && (
          <button
            onClick={runSync}
            disabled={loading}
            className="w-full py-2 rounded-lg text-[11px] font-medium bg-blue-900/50 hover:bg-blue-800/50 text-blue-300 border border-blue-800 disabled:opacity-40 transition-colors"
          >
            {loading ? '⟳ Sincronizando…' : `⟳ Sincronizar ${paapi.staleImages} imágenes stale`}
          </button>
        )}

        {!paapi.configured && (
          <div className="px-3 py-2.5 bg-gray-800/60 rounded-lg">
            <p className="text-[10px] font-semibold text-gray-400 mb-1.5">Variables requeridas</p>
            <div className="space-y-0.5 font-mono text-[9px] text-gray-500">
              <p>PAAPI_ACCESS_KEY=&lt;tu-access-key&gt;</p>
              <p>PAAPI_SECRET_KEY=&lt;tu-secret-key&gt;</p>
              <p>PAAPI_PARTNER_TAG=upgoodprice-20</p>
            </div>
          </div>
        )}

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
