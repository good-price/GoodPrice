/**
 * components/ops/ProductActionsMenu.tsx
 *
 * Per-product action dropdown.
 * Groups actions by category: tier control, lifecycle, pipeline.
 * 'use client' — requires interaction.
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import type { ProductAction }          from '@/lib/ops/actions/types'

interface ActionDef {
  action:  ProductAction
  label:   string
  icon:    string
  danger?: boolean
}

const ACTION_GROUPS: { label: string; actions: ActionDef[] }[] = [
  {
    label: 'Control de tier',
    actions: [
      { action: 'activate',  label: 'Activar (override)',  icon: '✅' },
      { action: 'downgrade', label: 'Degradar (override)', icon: '⬇️' },
      { action: 'suppress',  label: 'Suprimir (override)', icon: '🚫', danger: true },
      { action: 'restore',   label: 'Restaurar automático', icon: '🔄' },
    ],
  },
  {
    label: 'Ciclo de vida',
    actions: [
      { action: 'quarantine',   label: 'Poner en cuarentena', icon: '🔒', danger: true },
      { action: 'unquarantine', label: 'Salir de cuarentena', icon: '🔓' },
      { action: 'archive',      label: 'Archivar definitivo', icon: '📦', danger: true },
    ],
  },
  {
    label: 'Pipeline',
    actions: [
      { action: 'revalidate',     label: 'Revalidar (live-truth)', icon: '🔍' },
      { action: 'repair',         label: 'Reparar (pipeline)',     icon: '🔧' },
      { action: 'refresh-pricing', label: 'Actualizar precio',     icon: '💰' },
      { action: 'refresh-truth',  label: 'Refrescar truth score',  icon: '📊' },
      { action: 'rerun-repair',   label: 'Re-run repair',          icon: '🔁' },
    ],
  },
]

interface Props {
  productId: string
  productTitle: string
  currentTier:  string
}

export function ProductActionsMenu({ productId, productTitle }: Props) {
  const [open, setOpen]       = useState(false)
  const [active, setActive]   = useState<ProductAction | null>(null)
  const [reason, setReason]   = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActive(null)
      }
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  async function execute() {
    if (!active) return
    if (reason.trim().length < 5) return

    setLoading(true)
    try {
      const res = await fetch('/api/ops/products/action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          productId,
          action: active,
          reason: reason.trim(),
          operator: 'admin',
        }),
      })
      const data = await res.json() as { ok: boolean; error?: string; result?: { message: string } }
      setFeedback({
        ok:  data.ok,
        msg: data.ok ? (data.result?.message ?? 'Acción completada.') : (data.error ?? 'Error desconocido'),
      })
      if (data.ok) {
        setActive(null)
        setReason('')
        setTimeout(() => { setOpen(false); setFeedback(null) }, 2500)
      }
    } catch {
      setFeedback({ ok: false, msg: 'Error de red' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={() => { setOpen(o => !o); setFeedback(null); setActive(null) }}
        className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:border-gray-400 transition-all"
        title="Acciones del producto"
      >
        ⋯
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-64 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Acciones</p>
            <p className="text-xs text-gray-600 dark:text-gray-300 truncate mt-0.5">{productTitle}</p>
          </div>

          {/* Feedback */}
          {feedback && (
            <div className={[
              'px-3 py-2 text-xs',
              feedback.ok ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
            ].join(' ')}>
              {feedback.ok ? '✓' : '⚠'} {feedback.msg}
            </div>
          )}

          {/* Reason input when action selected */}
          {active && !feedback && (
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-blue-50 dark:bg-blue-900/20">
              <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-1">
                Razón requerida:
              </p>
              <input
                autoFocus
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Motivo de la acción…"
                maxLength={200}
                className="w-full text-xs bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                onKeyDown={e => { if (e.key === 'Enter') execute() }}
              />
              <div className="flex gap-2 mt-1.5">
                <button
                  onClick={execute}
                  disabled={loading || reason.trim().length < 5}
                  className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded px-2 py-1 disabled:opacity-50 transition-colors"
                >
                  {loading ? '…' : 'Confirmar'}
                </button>
                <button
                  onClick={() => { setActive(null); setReason('') }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Action groups */}
          {!feedback && (
            <div className="max-h-72 overflow-y-auto">
              {ACTION_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="px-3 pt-2 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    {group.label}
                  </p>
                  {group.actions.map(({ action, label, icon, danger }) => (
                    <button
                      key={action}
                      onClick={() => { setActive(action); setReason('') }}
                      className={[
                        'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
                        active === action ? 'bg-blue-50 dark:bg-blue-900/20 font-semibold' : '',
                        danger ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200',
                      ].join(' ')}
                    >
                      <span>{icon}</span>
                      {label}
                      {active === action && <span className="ml-auto text-blue-500 text-[10px]">→</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
