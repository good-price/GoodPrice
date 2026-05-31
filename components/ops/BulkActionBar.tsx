/**
 * components/ops/BulkActionBar.tsx
 *
 * Floating bulk-action bar shown when ≥1 rows are selected in CatalogTable.
 * B6: Adds confirmation dialogs for destructive actions + CSV export.
 *
 * 'use client' — requires interaction.
 */

'use client'

import { useState, useMemo } from 'react'
import type { ProductAction, CatalogTableRow } from '@/lib/ops/actions/types'
import { getAvailableActionsForTier } from '@/lib/ops/actions/lifecycle-transitions'

interface BulkActionDef {
  action:   ProductAction
  label:    string
  danger?:  boolean
  confirm?: boolean   // requires explicit confirmation step
}

const BULK_ACTIONS: BulkActionDef[] = [
  { action: 'revalidate',    label: 'Revalidar' },
  { action: 'refresh-truth', label: 'Ejecutar Truth' },
  { action: 'repair',        label: 'Ejecutar Repair' },
  { action: 'restore',       label: 'Restaurar' },
  { action: 'archive',       label: 'Archivar',    danger: true, confirm: true },
  { action: 'quarantine',    label: 'Cuarentena',  danger: true, confirm: true },
  { action: 'suppress',      label: 'Suprimir',    danger: true, confirm: true },
]

interface Props {
  selectedIds:      string[]
  selectedRows:     CatalogTableRow[]   // for export
  onClearSelection: () => void
  onActionComplete: () => void
}

// ── CSV export ─────────────────────────────────────────────────────────────────

function exportCsv(rows: CatalogTableRow[]): void {
  const headers = ['productId', 'asin', 'title', 'category', 'tier', 'score', 'status']
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      r.productId,
      r.asin,
      `"${r.title.replace(/"/g, '""')}"`,
      r.category,
      r.tier,
      Math.round(r.publicScore * 100),
      r.productStatus,
    ].join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `ops-selection-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main component ────────────────────────────────────────────────────────────

export function BulkActionBar({
  selectedIds,
  selectedRows,
  onClearSelection,
  onActionComplete,
}: Props) {
  const [active,      setActive]      = useState<ProductAction | null>(null)
  const [confirming,  setConfirming]  = useState(false)
  const [reason,      setReason]      = useState('')
  const [loading,     setLoading]     = useState(false)
  const [feedback,    setFeedback]    = useState<{ ok: boolean; msg: string } | null>(null)

  // Intersection of valid actions across all selected tiers
  const availableActions = useMemo(() => {
    if (selectedRows.length === 0) return new Set<ProductAction>()
    const sets = selectedRows.map(r => {
      const tier =
        r.hasOverride && r.tier === 'active'     ? 'override-active'     :
        r.hasOverride && r.tier === 'suppressed' ? 'override-suppressed' :
        r.tier
      return new Set(getAvailableActionsForTier(tier))
    })
    return sets.reduce((acc, s) => new Set(Array.from(acc).filter(a => s.has(a))), sets[0])
  }, [selectedRows])

  const count = selectedIds.length
  if (count === 0) return null

  function handleActionClick(def: BulkActionDef) {
    setFeedback(null)
    setActive(def.action)
    setReason('')
    setConfirming(!!def.confirm)
  }

  function handleConfirm() {
    setConfirming(false)
  }

  function handleCancel() {
    setActive(null)
    setReason('')
    setConfirming(false)
  }

  async function execute() {
    if (!active) return
    setLoading(true)
    try {
      const res  = await fetch('/api/ops/products/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          productIds: selectedIds,
          action:     active,
          reason:     reason.trim() || 'admin-action',
          operator:   'admin',
        }),
      })
      const data = await res.json() as {
        ok: boolean
        succeeded: number
        failed: number
        error?: string
      }
      if (data.ok || data.succeeded > 0) {
        setFeedback({
          ok:  true,
          msg: `${data.succeeded} de ${count} procesados${data.failed ? ` (${data.failed} fallaron)` : ''}`,
        })
        setTimeout(() => {
          setFeedback(null)
          setActive(null)
          setReason('')
          onClearSelection()
          onActionComplete()
        }, 2500)
      } else {
        setFeedback({ ok: false, msg: data.error ?? 'Error desconocido' })
      }
    } catch {
      setFeedback({ ok: false, msg: 'Error de red' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl px-4">
      <div className="bg-gray-900 text-white rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{count}</span>
            <span className="text-sm font-medium text-gray-200">
              {count === 1 ? 'producto seleccionado' : 'productos seleccionados'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCsv(selectedRows)}
              className="text-[10px] font-medium text-gray-400 hover:text-gray-200 px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition-colors"
              title="Exportar selección como CSV"
            >
              ↓ Exportar
            </button>
            <button
              onClick={() => { onClearSelection(); setActive(null); setReason(''); setFeedback(null) }}
              className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={[
            'px-4 py-2 text-sm',
            feedback.ok ? 'bg-green-800/60 text-green-200' : 'bg-red-800/60 text-red-200',
          ].join(' ')}>
            {feedback.ok ? '✓' : '⚠'} {feedback.msg}
          </div>
        )}

        {/* Confirmation step */}
        {confirming && active && !feedback && (
          <div className="px-4 py-3 border-b border-gray-700 bg-orange-900/30">
            <p className="text-xs font-semibold text-orange-300 mb-2">
              ⚠ ¿Confirmar <span className="font-bold">{active}</span> en {count} producto{count !== 1 ? 's' : ''}?
              Esta acción puede no ser reversible.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="flex-1 text-xs py-1.5 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 text-xs py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors font-medium"
              >
                Sí, continuar
              </button>
            </div>
          </div>
        )}

        {/* Reason input */}
        {active && !confirming && !feedback && (
          <div className="px-4 py-2.5 border-b border-gray-700 bg-blue-900/20">
            <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1.5">
              Razón — {active} ({count} productos)
            </p>
            <div className="flex gap-2">
              <input
                autoFocus
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Motivo de la acción…"
                maxLength={200}
                className="flex-1 text-sm bg-gray-800 border border-blue-600 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
                onKeyDown={e => { if (e.key === 'Enter') execute() }}
              />
              <button
                onClick={execute}
                disabled={loading}
                className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors font-medium"
              >
                {loading ? '…' : 'Confirmar'}
              </button>
              <button
                onClick={handleCancel}
                className="text-sm text-gray-400 hover:text-white px-3 py-1.5 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Action chips — only show valid transitions for the current selection */}
        {!feedback && (
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {BULK_ACTIONS.filter(({ action }) => availableActions.has(action)).map(({ action, label, danger }) => (
              <button
                key={action}
                onClick={() => handleActionClick({ action, label, danger, confirm: BULK_ACTIONS.find(a => a.action === action)?.confirm })}
                className={[
                  'text-xs px-3 py-1.5 rounded-lg transition-all font-medium',
                  active === action
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                    : danger
                      ? 'bg-red-900/50 text-red-300 hover:bg-red-800/60'
                      : 'bg-gray-700 text-gray-200 hover:bg-gray-600',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
