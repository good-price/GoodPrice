/**
 * components/ops/ProductDrawer.tsx
 *
 * Right-side drawer for a single catalog product.
 * Opens on row click in CatalogTable — no navigation, no modal.
 *
 * Contains (B1) product info + actions, (B2) timeline, (B3) health summary.
 * All data sourced from the passed CatalogTableRow + /api/ops/products/history.
 *
 * 'use client' — interaction + fetch.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import type { CatalogTableRow, ProductAction, ProductHistoryEntry } from '@/lib/ops/actions/types'

// ── Tier colours ──────────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, string> = {
  active:      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  warning:     'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  degraded:    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  suppressed:  'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  quarantined: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  archived:    'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

const TIER_LABEL: Record<string, string> = {
  active:      '● Active',
  warning:     '● Warning',
  degraded:    '● Degraded',
  suppressed:  '● Suppressed',
  quarantined: '🔒 Quarantined',
  archived:    '📦 Archived',
}

// ── Inline action definitions ─────────────────────────────────────────────────

interface ActionDef {
  action:  ProductAction
  label:   string
  danger?: boolean
  confirm?: boolean
}

const DRAWER_ACTIONS: ActionDef[] = [
  { action: 'revalidate',    label: 'Revalidar' },
  { action: 'refresh-truth', label: 'Ejecutar Truth' },
  { action: 'repair',        label: 'Ejecutar Repair' },
  { action: 'restore',       label: 'Restaurar' },
  { action: 'suppress',      label: 'Ocultar',           danger: true, confirm: true },
  { action: 'archive',       label: 'Archivar',          danger: true, confirm: true },
  { action: 'quarantine',    label: 'Cuarentena',        danger: true, confirm: true },
  { action: 'unquarantine',  label: 'Quitar cuarentena' },
]

// ── Timeline item ─────────────────────────────────────────────────────────────

function TimelineItem({ entry, last }: { entry: ProductHistoryEntry; last: boolean }) {
  const d      = new Date(entry.timestamp)
  const dateFmt = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
  const timeFmt = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })

  return (
    <div className="flex gap-3 text-xs">
      <div className="flex flex-col items-center flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${entry.automated ? 'bg-blue-400' : 'bg-gray-400'}`} />
        {!last && <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1 min-h-[12px]" />}
      </div>
      <div className="pb-3 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-800 dark:text-gray-200 leading-tight">{entry.event}</span>
          {entry.automated && (
            <span className="text-[9px] bg-blue-50 dark:bg-blue-900/30 text-blue-500 px-1 py-0.5 rounded">auto</span>
          )}
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5 truncate" title={entry.detail}>
          {entry.detail}
        </p>
        <p className="text-[9px] text-gray-400 dark:text-gray-600 mt-0.5 font-mono">
          {dateFmt} {timeFmt}
          {entry.operator && ` · ${entry.operator}`}
        </p>
      </div>
    </div>
  )
}

// ── Suppression reasons ────────────────────────────────────────────────────────

function SuppressionReasons({ row }: { row: CatalogTableRow }) {
  const reasons: string[] = []

  if (row.suppressionReason) reasons.push(row.suppressionReason)
  if (!row.colombiaOk && row.colombiaOk !== null) reasons.push('Colombia no disponible')
  if (row.hasFakeDiscount) reasons.push('Descuento falso detectado')
  if (row.pricingTruthScore !== null && row.pricingTruthScore < 0.4) reasons.push('Pricing score bajo')
  if (row.warningCount > 2) reasons.push(`${row.warningCount} señales de advertencia`)

  if (reasons.length === 0) return null

  return (
    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">Razones activas</p>
      <ul className="space-y-1">
        {reasons.map((r, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
            <span className="text-red-400 flex-shrink-0 mt-0.5">✕</span>
            {r}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Health summary (B3) ────────────────────────────────────────────────────────

function HealthSummary({ row }: { row: CatalogTableRow }) {
  const trustScore    = Math.round(row.publicScore * 100)
  const pricingScore  = row.pricingTruthScore !== null ? Math.round(row.pricingTruthScore * 100) : null
  const isRecoverable = row.tier === 'suppressed' &&
    !row.tier.includes('quarantine') &&
    row.productStatus === 'active'

  const scoreColor = (s: number) =>
    s >= 70 ? 'text-green-600 dark:text-green-400' :
    s >= 40 ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-500 dark:text-red-400'

  return (
    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Health</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400">Trust Score</span>
          <span className={`font-bold tabular-nums ${scoreColor(trustScore)}`}>{trustScore}</span>
        </div>
        {pricingScore !== null && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">Pricing Truth</span>
            <span className={`font-bold tabular-nums ${scoreColor(pricingScore)}`}>{pricingScore}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400">Visibilidad</span>
          <span className={`font-bold ${row.isPublic ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
            {row.isPublic ? '● Público' : '● Oculto'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400">Recuperable</span>
          <span className={`font-bold ${isRecoverable ? 'text-blue-500' : 'text-gray-400'}`}>
            {isRecoverable ? 'Sí' : 'No'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400">Colombia</span>
          <span className={`font-bold ${row.colombiaOk ? 'text-green-600 dark:text-green-400' : row.colombiaOk === null ? 'text-gray-400' : 'text-orange-500'}`}>
            {row.colombiaOk ? 'Disponible' : row.colombiaOk === null ? 'Desconocido' : 'Restringido'}
          </span>
        </div>
        {row.warningCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">Warnings</span>
            <span className={`font-bold ${row.warningCount > 2 ? 'text-orange-500' : 'text-yellow-500'}`}>
              {row.warningCount}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main drawer ───────────────────────────────────────────────────────────────

interface Props {
  row:     CatalogTableRow | null
  onClose: () => void
}

export function ProductDrawer({ row, onClose }: Props) {
  const [activeAction, setActiveAction] = useState<ProductAction | null>(null)
  const [reason,       setReason]       = useState('')
  const [loading,      setLoading]      = useState(false)
  const [feedback,     setFeedback]     = useState<{ ok: boolean; msg: string } | null>(null)
  const [confirming,   setConfirming]   = useState(false)
  const [timeline,     setTimeline]     = useState<ProductHistoryEntry[]>([])
  const [tlLoading,    setTlLoading]    = useState(false)

  // Reset state when row changes
  useEffect(() => {
    setActiveAction(null)
    setReason('')
    setFeedback(null)
    setConfirming(false)
    setTimeline([])
  }, [row?.productId])

  // Fetch timeline when drawer opens (use productId directly — not `row` — so ESLint is satisfied)
  const productId = row?.productId ?? null
  useEffect(() => {
    if (!productId) return
    setTlLoading(true)
    fetch(`/api/ops/products/history?productId=${productId}`)
      .then(r => r.json())
      .then((data: { ok: boolean; timeline?: ProductHistoryEntry[] }) => {
        if (data.ok) setTimeline(data.timeline ?? [])
      })
      .catch(() => {})
      .finally(() => setTlLoading(false))
  }, [productId])

  // Escape key closes drawer
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const execute = useCallback(async () => {
    if (!row || !activeAction || reason.trim().length < 5) return
    setLoading(true)
    try {
      const res  = await fetch('/api/ops/products/action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          productId: row.productId,
          action:    activeAction,
          reason:    reason.trim(),
          operator:  'admin',
        }),
      })
      const data = await res.json() as { ok: boolean; error?: string; result?: { message: string } }
      setFeedback({
        ok:  data.ok,
        msg: data.ok ? (data.result?.message ?? 'Acción completada.') : (data.error ?? 'Error desconocido'),
      })
      if (data.ok) {
        setActiveAction(null)
        setReason('')
        setConfirming(false)
        // Refresh timeline after action
        setTimeout(() => {
          setFeedback(null)
          fetch(`/api/ops/products/history?productId=${row.productId}`)
            .then(r => r.json())
            .then((d: { ok: boolean; timeline?: ProductHistoryEntry[] }) => {
              if (d.ok) setTimeline(d.timeline ?? [])
            })
            .catch(() => {})
        }, 2000)
      }
    } catch {
      setFeedback({ ok: false, msg: 'Error de red' })
    } finally {
      setLoading(false)
    }
  }, [row, activeAction, reason])

  if (!row) return null

  const tierBadgeCls = TIER_BADGE[row.tier] ?? TIER_BADGE.suppressed
  const tierLabel    = TIER_LABEL[row.tier]  ?? row.tier

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="fixed right-0 top-0 h-full w-[380px] z-50 flex flex-col bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="min-w-0 flex-1 pr-2">
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 leading-tight truncate">
              {row.title}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tierBadgeCls}`}>
                {tierLabel}
              </span>
              {row.hasOverride && (
                <span className="text-[9px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
                  ✎ override
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg leading-none mt-0.5 transition-colors"
            aria-label="Cerrar drawer"
          >
            ✕
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Product info */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Producto</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
              {[
                ['ASIN',       row.asin,           'font-mono'],
                ['Categoría',  row.category,        ''],
                ['Precio',     `$${row.price.toLocaleString('es-CO', { minimumFractionDigits: 0 })}`, 'font-semibold'],
                ['Estado',     row.productStatus,   ''],
              ].map(([label, value, cls]) => (
                <div key={label as string}>
                  <dt className="text-gray-400 dark:text-gray-500">{label}</dt>
                  <dd className={`text-gray-800 dark:text-gray-200 truncate ${cls}`}>{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Suppression reasons */}
          <SuppressionReasons row={row} />

          {/* Health summary (B3) */}
          <HealthSummary row={row} />

          {/* ── ACCIONES ────────────────────────────────────────────────────── */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Acciones</p>

            {/* Feedback */}
            {feedback && (
              <div className={`mb-2 px-3 py-2 rounded-lg text-xs ${feedback.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300'}`}>
                {feedback.ok ? '✓' : '⚠'} {feedback.msg}
              </div>
            )}

            {/* Confirmation step */}
            {confirming && activeAction && !feedback && (
              <div className="mb-2 px-3 py-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                <p className="text-[10px] font-semibold text-orange-700 dark:text-orange-300 mb-1.5">
                  ⚠ Confirmar: {activeAction}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 text-[11px] py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 text-[11px] py-1 rounded bg-orange-500 text-white hover:bg-orange-600 transition-colors font-medium"
                  >
                    Sí, continuar
                  </button>
                </div>
              </div>
            )}

            {/* Reason input */}
            {activeAction && !confirming && !feedback && (
              <div className="mb-2 space-y-1.5">
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  Razón para <span className="font-semibold text-gray-700 dark:text-gray-200">{activeAction}</span>:
                </p>
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Motivo (mín. 5 chars)…"
                    maxLength={200}
                    className="flex-1 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
                    onKeyDown={e => { if (e.key === 'Enter') execute() }}
                  />
                  <button
                    onClick={execute}
                    disabled={loading || reason.trim().length < 5}
                    className="text-[11px] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 rounded-lg transition-colors font-medium"
                  >
                    {loading ? '…' : '↵'}
                  </button>
                  <button
                    onClick={() => { setActiveAction(null); setReason('') }}
                    className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-1.5">
              {DRAWER_ACTIONS.map(({ action, label, danger, confirm: needsConfirm }) => (
                <button
                  key={action}
                  onClick={() => {
                    setFeedback(null)
                    if (needsConfirm) {
                      setActiveAction(action)
                      setReason('')
                      setConfirming(true)
                    } else {
                      setActiveAction(action)
                      setReason('')
                      setConfirming(false)
                    }
                  }}
                  disabled={loading}
                  className={[
                    'text-[10px] font-medium px-2.5 py-1.5 rounded-lg border transition-all',
                    activeAction === action
                      ? 'bg-blue-600 text-white border-blue-600'
                      : danger
                        ? 'border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── TIMELINE (B2) ──────────────────────────────────────────────── */}
          <div className="px-4 py-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Timeline
              {timeline.length > 0 && (
                <span className="ml-1.5 text-[9px] font-normal text-gray-300 dark:text-gray-600 normal-case tracking-normal">
                  ({timeline.length} eventos)
                </span>
              )}
            </p>

            {tlLoading ? (
              <p className="text-[11px] text-gray-400 animate-pulse">Cargando…</p>
            ) : timeline.length === 0 ? (
              <p className="text-[11px] text-gray-400">Sin eventos registrados para este producto.</p>
            ) : (
              <div>
                {timeline.map((entry, i) => (
                  <TimelineItem key={i} entry={entry} last={i === timeline.length - 1} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
