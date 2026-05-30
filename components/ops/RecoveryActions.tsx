/**
 * components/ops/RecoveryActions.tsx
 *
 * Client component — recovery and ops execution action buttons.
 *
 * Buttons POST to /api/ops/run with the appropriate job type or pipeline.
 * Shows inline feedback (loading, success, error) without page reload.
 *
 * 'use client' — minimal JS, only event handlers and state for feedback.
 */

'use client'

import { useState } from 'react'
import type { ExecJobType } from '@/lib/ops/execution'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActionDef {
  id:           string
  label:        string
  description:  string
  type?:        ExecJobType
  pipeline?:    string
  options?:     Record<string, unknown>
  variant:      'primary' | 'secondary' | 'danger' | 'recovery'
  durationHint: string
}

// ── Action definitions ────────────────────────────────────────────────────────

const ACTIONS: ActionDef[] = [
  {
    id:           'recover-catalog',
    label:        '🚀 Recuperar catálogo',
    description:  'Pipeline completo: trust → repair → live-truth → auditorías → self-healing',
    pipeline:     'recovery',
    variant:      'recovery',
    durationHint: '~5-8 min',
  },
  {
    id:           'quick-recover',
    label:        '⚡ Recuperación rápida',
    description:  'Trust recompute + self-healing (sin auditorías de red)',
    pipeline:     'quick-recovery',
    variant:      'primary',
    durationHint: '~15 seg',
  },
  {
    id:           'trust-recompute',
    label:        'Recomputar trust',
    description:  'Recalcula tiers de visibilidad y score de confianza',
    type:         'trust-recompute',
    variant:      'secondary',
    durationHint: '~2 seg',
  },
  {
    id:           'self-healing',
    label:        'Self-Healing',
    description:  'Archiva, recupera y repara drift del catálogo',
    type:         'self-healing',
    options:      { forceRun: true },
    variant:      'secondary',
    durationHint: '~5 seg',
  },
  {
    id:           'repair',
    label:        'Reparar imágenes',
    description:  'Pipeline de reparación CDN para imágenes stale',
    type:         'repair',
    variant:      'secondary',
    durationHint: '~20 seg',
  },
  {
    id:           'link-audit',
    label:        'Auditar enlaces',
    description:  'Verifica accesibilidad de páginas Amazon (20 productos)',
    type:         'link-audit',
    options:      { maxProducts: 20 },
    variant:      'secondary',
    durationHint: '~1-2 min',
  },
  {
    id:           'colombia-audit',
    label:        'Auditar Colombia',
    description:  'Verifica disponibilidad de envío a Colombia (20 productos)',
    type:         'colombia-audit',
    options:      { maxProducts: 20 },
    variant:      'secondary',
    durationHint: '~1-2 min',
  },
  {
    id:           'live-truth',
    label:        'Validar productos',
    description:  'Valida los siguientes 10 productos en la cola',
    type:         'live-truth',
    options:      { limit: 10 },
    variant:      'secondary',
    durationHint: '~30 seg',
  },
]

// ── Styles ────────────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<string, string> = {
  recovery:  'bg-[#F7A823] hover:bg-[#e59800] text-white font-bold border border-[#e59800]',
  primary:   'bg-gray-900 hover:bg-gray-700 text-white font-semibold border border-gray-700',
  secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200',
  danger:    'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface FeedbackState {
  actionId: string
  type:     'loading' | 'success' | 'error' | 'conflict'
  message:  string
}

export function RecoveryActions() {
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)

  async function runAction(action: ActionDef) {
    setFeedback({ actionId: action.id, type: 'loading', message: `Ejecutando ${action.label}…` })

    try {
      const body: Record<string, unknown> = { operator: 'admin-ui' }

      if (action.pipeline) {
        body.pipeline = action.pipeline
        if (action.options) body.options = action.options
      } else if (action.type) {
        body.type    = action.type
        body.options = action.options ?? {}
      }

      const res = await fetch('/api/ops/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })

      const data = await res.json() as Record<string, unknown>

      if (res.status === 409) {
        setFeedback({ actionId: action.id, type: 'conflict', message: String(data.error ?? 'Ya en ejecución') })
        return
      }

      if (!res.ok || data.ok === false) {
        setFeedback({ actionId: action.id, type: 'error', message: String(data.error ?? 'Error desconocido') })
        return
      }

      // Build result message
      let message = '✓ Completado'
      if (action.pipeline) {
        const run = data.pipeline as Record<string, unknown> | undefined
        if (run?.status === 'completed') message = `✓ Pipeline completado (${(run.jobIds as string[])?.length ?? 0} etapas)`
        else if (run?.status === 'failed') message = `⚠ Pipeline fallido en etapa ${run.currentStage}`
      } else {
        const result = data.result as Record<string, unknown> | undefined
        if (result?.summary) message = `✓ ${result.summary}`
      }

      setFeedback({ actionId: action.id, type: 'success', message })
      setTimeout(() => setFeedback(null), 6_000)
    } catch (err) {
      setFeedback({ actionId: action.id, type: 'error', message: `Error de red: ${String(err)}` })
    }
  }

  const isLoading = feedback?.type === 'loading'

  return (
    <div className="space-y-3">
      {/* Feedback banner */}
      {feedback && (
        <div className={`text-[11px] rounded-lg px-3 py-2 border leading-relaxed ${
          feedback.type === 'loading'  ? 'bg-blue-50 border-blue-100 text-blue-700' :
          feedback.type === 'success'  ? 'bg-green-50 border-green-100 text-green-700' :
          feedback.type === 'conflict' ? 'bg-amber-50 border-amber-100 text-amber-700' :
          'bg-red-50 border-red-100 text-red-700'
        }`}>
          {feedback.type === 'loading' && (
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-ping mr-2" />
          )}
          {feedback.message}
        </div>
      )}

      {/* Primary actions (recovery) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ACTIONS.filter(a => a.variant === 'recovery' || a.variant === 'primary').map(action => (
          <button
            key={action.id}
            onClick={() => runAction(action)}
            disabled={isLoading}
            className={`text-left px-4 py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_STYLES[action.variant]}`}
          >
            <p className="text-sm">{action.label}</p>
            <p className="text-[10px] opacity-75 mt-0.5">{action.description}</p>
            <p className="text-[9px] opacity-50 mt-1">{action.durationHint}</p>
          </button>
        ))}
      </div>

      {/* Secondary actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {ACTIONS.filter(a => a.variant === 'secondary').map(action => (
          <button
            key={action.id}
            onClick={() => runAction(action)}
            disabled={isLoading}
            className={`text-left px-3 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_STYLES[action.variant]}`}
          >
            <p className="text-xs font-medium">{action.label}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{action.durationHint}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
