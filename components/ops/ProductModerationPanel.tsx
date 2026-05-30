/**
 * components/ops/ProductModerationPanel.tsx
 *
 * Operator moderation panel: add notes, set risk level, pin comments.
 * 'use client' — requires interaction.
 */

'use client'

import { useState } from 'react'
import type { RiskLevel, ModerationEntry } from '@/lib/ops/actions/types'

interface Props {
  productId:  string
  moderation: ModerationEntry | null
  onUpdate?:  () => void
}

const RISK_LEVELS: { value: RiskLevel; label: string; cls: string }[] = [
  { value: 'low',      label: 'Bajo',     cls: 'bg-green-100 text-green-700 hover:bg-green-200' },
  { value: 'medium',   label: 'Medio',    cls: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' },
  { value: 'high',     label: 'Alto',     cls: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
  { value: 'critical', label: 'Crítico',  cls: 'bg-red-100 text-red-700 hover:bg-red-200' },
]

async function apiPost(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    return res.json() as Promise<{ ok: boolean; error?: string }>
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export function ProductModerationPanel({ productId, moderation, onUpdate }: Props) {
  const [note, setNote]         = useState('')
  const [pinNote, setPinNote]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const currentRisk = moderation?.riskLevel ?? null
  const notes       = moderation?.notes ?? []

  async function handleAddNote() {
    if (note.trim().length < 3) { setError('La nota debe tener al menos 3 caracteres.'); return }
    setSaving(true); setError('')
    const res = await apiPost('/api/ops/products/action', {
      productId,
      action:   'add-note' as const,
      reason:   note.trim(),
      operator: 'admin',
      options:  { pinned: pinNote },
    })
    setSaving(false)
    if (!res.ok) { setError(res.error ?? 'Error'); return }
    setNote('')
    setPinNote(false)
    onUpdate?.()
  }

  async function handleSetRisk(level: RiskLevel | null) {
    setSaving(true); setError('')
    const res = await apiPost('/api/ops/products/action', {
      productId,
      action:   'set-risk' as const,
      reason:   level ? `Riesgo: ${level}` : 'Riesgo eliminado',
      operator: 'admin',
      options:  { riskLevel: level },
    })
    setSaving(false)
    if (!res.ok) { setError(res.error ?? 'Error'); return }
    onUpdate?.()
  }

  return (
    <div className="space-y-4">
      {/* Risk level selector */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Nivel de riesgo
        </p>
        <div className="flex flex-wrap gap-1.5">
          {RISK_LEVELS.map(({ value, label, cls }) => (
            <button
              key={value}
              onClick={() => handleSetRisk(currentRisk === value ? null : value)}
              disabled={saving}
              className={[
                'text-[10px] font-bold px-2 py-1 rounded transition-all',
                currentRisk === value ? cls + ' ring-2 ring-offset-1 ring-current' : cls,
                'disabled:opacity-50',
              ].join(' ')}
            >
              {label}
              {currentRisk === value && ' ✓'}
            </button>
          ))}
          {currentRisk && (
            <button
              onClick={() => handleSetRisk(null)}
              disabled={saving}
              className="text-[10px] text-gray-400 hover:text-red-500 px-2 py-1 transition-colors"
            >
              ✕ quitar
            </button>
          )}
        </div>
      </div>

      {/* Add note */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Añadir nota
        </p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Escribe una nota operacional..."
          className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex items-center justify-between mt-1.5">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={pinNote}
              onChange={e => setPinNote(e.target.checked)}
              className="rounded"
            />
            📌 Fijar nota
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">{note.length}/500</span>
            <button
              onClick={handleAddNote}
              disabled={saving || note.trim().length < 3}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando…' : 'Añadir'}
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-red-500 mt-1">⚠ {error}</p>}
      </div>

      {/* Existing notes */}
      {notes.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Notas ({notes.length})
          </p>
          <div className="space-y-2">
            {notes.map(n => (
              <div
                key={n.id}
                className={[
                  'rounded-lg p-2.5 text-xs',
                  n.pinned
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                    : 'bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-gray-700 dark:text-gray-200 leading-snug flex-1">{n.text}</p>
                  {n.pinned && <span className="text-[10px] flex-shrink-0">📌</span>}
                </div>
                <p className="text-[9px] text-gray-400 mt-1">
                  {n.operator} · {new Date(n.createdAt).toLocaleDateString('es-CO')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
