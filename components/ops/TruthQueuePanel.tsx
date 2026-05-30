/**
 * components/ops/TruthQueuePanel.tsx
 *
 * Displays the Live Truth validation queue status.
 * Shows pending items, priority distribution, stale count, and quick actions.
 *
 * 'use client' — server actions + queue polling.
 */

'use client'

import { useState, useCallback } from 'react'
import type { TruthQueueStatus }  from '@/lib/ops/activation/types'

interface Props {
  initial?: TruthQueueStatus | null
}

export function TruthQueuePanel({ initial = null }: Props) {
  const [queue,    setQueue]    = useState<TruthQueueStatus | null>(initial)
  const [loading,  setLoading]  = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  const fetchQueue = useCallback(async () => {
    try {
      const res  = await fetch('/api/ops/recovery/report', { cache: 'no-store' })
      const data = await res.json() as { ok: boolean; report: { truthQueue: TruthQueueStatus } }
      if (data.ok) setQueue(data.report.truthQueue)
    } catch { /* ignore */ }
  }, [])

  const runValidation = useCallback(async (mode: 'next' | 'batch') => {
    setLoading(true)
    setFeedback(null)
    try {
      const res  = await fetch('/api/catalog/live-truth/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ operator: 'admin', limit: mode === 'batch' ? 10 : 1 }),
      })
      const data = await res.json() as { ok: boolean; error?: string; result?: { summary?: string } }
      setFeedback({
        ok:      data.ok,
        message: data.ok
          ? (data.result?.summary ?? 'Validación ejecutada correctamente')
          : (data.error ?? 'Error al ejecutar validación'),
      })
      if (data.ok) fetchQueue()
    } catch {
      setFeedback({ ok: false, message: 'Error de red' })
    } finally {
      setLoading(false)
      setTimeout(() => setFeedback(null), 4000)
    }
  }, [fetchQueue])

  if (!queue) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-[11px] text-gray-600 text-center py-4">Cola no inicializada</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div>
          <h3 className="text-sm font-bold text-gray-100">Truth Queue</h3>
          <p className="text-[10px] text-gray-500">Live truth validation queue</p>
        </div>
        {queue.backlog && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-900/40 text-orange-300 border border-orange-800">
            ⚠ Backlog
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className={`text-2xl font-black tabular-nums ${queue.pending > 20 ? 'text-orange-400' : 'text-gray-300'}`}>
              {queue.pending}
            </p>
            <p className="text-[9px] text-gray-600 uppercase tracking-wide">Pendientes</p>
          </div>
          <div>
            <p className={`text-2xl font-black tabular-nums ${queue.highPriority > 5 ? 'text-yellow-400' : 'text-gray-400'}`}>
              {queue.highPriority}
            </p>
            <p className="text-[9px] text-gray-600 uppercase tracking-wide">Alta prioridad</p>
          </div>
          <div>
            <p className={`text-2xl font-black tabular-nums ${queue.stale > 10 ? 'text-red-400' : 'text-gray-400'}`}>
              {queue.stale}
            </p>
            <p className="text-[9px] text-gray-600 uppercase tracking-wide">Stale (+48h)</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => runValidation('next')}
            disabled={loading || queue.pending === 0}
            className="py-2 px-3 rounded-lg text-[11px] font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 transition-colors"
          >
            {loading ? '⟳ Validando…' : '→ Validar siguiente'}
          </button>
          <button
            onClick={() => runValidation('batch')}
            disabled={loading || queue.pending === 0}
            className="py-2 px-3 rounded-lg text-[11px] font-medium bg-blue-900/50 hover:bg-blue-800/50 text-blue-300 border border-blue-800 disabled:opacity-40 transition-colors"
          >
            {loading ? '⟳ Procesando…' : '⟳ Batch (10)'}
          </button>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`px-3 py-2 rounded-lg text-[10px] ${feedback.ok ? 'bg-green-900/20 text-green-300' : 'bg-red-900/20 text-red-300'}`}>
            {feedback.ok ? '✓' : '✕'} {feedback.message}
          </div>
        )}

        {/* Top queue items */}
        {queue.items.length > 0 && (
          <div className="space-y-1">
            <p className="text-[9px] text-gray-600 uppercase tracking-widest">Top pendientes</p>
            {queue.items.slice(0, 5).map(item => (
              <div key={item.productId} className="flex items-center gap-2 px-2 py-1.5 bg-gray-800/40 rounded-lg">
                <span className={`text-[9px] font-bold w-6 text-center rounded ${item.priority >= 70 ? 'text-yellow-300' : 'text-gray-500'}`}>
                  {item.priority}
                </span>
                <span className="text-[10px] text-gray-400 font-mono truncate flex-1">{item.asin}</span>
                <span className={`text-[9px] flex-shrink-0 ${item.ageHours > 48 ? 'text-red-400' : 'text-gray-600'}`}>
                  {item.ageHours > 9000 ? 'nunca' : `${item.ageHours}h`}
                </span>
              </div>
            ))}
          </div>
        )}

        {queue.pending === 0 && (
          <p className="text-[11px] text-green-400 text-center">✓ Cola vacía — todos validados</p>
        )}
      </div>
    </div>
  )
}
