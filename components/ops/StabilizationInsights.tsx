/**
 * components/ops/StabilizationInsights.tsx
 *
 * Renders the prioritized list of stabilization recommendations with
 * one-click action buttons that fire the associated API endpoints.
 *
 * 'use client' because buttons need onClick handlers.
 */

'use client'

import { useState } from 'react'
import type { StabilizationRecommendation, RecoveryPriority } from '@/lib/catalog/stabilization/types'

interface Props {
  recommendations: StabilizationRecommendation[]
}

// ── Priority styling ────────────────────────────────────────────────────────────

const PRIORITY_BADGE: Record<RecoveryPriority, string> = {
  immediate: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  high:      'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  medium:    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  low:       'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

const PRIORITY_LABEL: Record<RecoveryPriority, string> = {
  immediate: 'Inmediato',
  high:      'Alto',
  medium:    'Medio',
  low:       'Bajo',
}

// ── Action state ──────────────────────────────────────────────────────────────

type ActionState = 'idle' | 'loading' | 'ok' | 'error'

interface ActionStatuses {
  [key: string]: ActionState
}

async function fireAction(rec: StabilizationRecommendation): Promise<void> {
  if (!rec.endpoint) return

  const opts: RequestInit = {
    method:  rec.method ?? 'POST',
    headers: { 'Content-Type': 'application/json' },
  }

  if (rec.method !== 'GET' && rec.body) {
    opts.body = JSON.stringify(rec.body)
  }

  const res = await fetch(rec.endpoint, opts)
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StabilizationInsights({ recommendations }: Props) {
  const [statuses, setStatuses] = useState<ActionStatuses>({})
  const [errors, setErrors]     = useState<Record<string, string>>({})

  const setStatus = (key: string, state: ActionState) =>
    setStatuses(prev => ({ ...prev, [key]: state }))
  const setError = (key: string, msg: string) =>
    setErrors(prev => ({ ...prev, [key]: msg }))

  async function handleAction(rec: StabilizationRecommendation, key: string) {
    setStatus(key, 'loading')
    setError(key, '')
    try {
      await fireAction(rec)
      setStatus(key, 'ok')
      setTimeout(() => setStatus(key, 'idle'), 4000)
    } catch (err) {
      setStatus(key, 'error')
      setError(key, err instanceof Error ? err.message : String(err))
    }
  }

  if (recommendations.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
          Recomendaciones de estabilización
        </h3>
        <p className="text-sm text-gray-500">El catálogo está en buen estado. No hay acciones necesarias.</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Recomendaciones de estabilización
        </h3>
        <span className="text-xs text-gray-400">{recommendations.length} acción{recommendations.length !== 1 ? 'es' : ''}</span>
      </div>

      <div className="space-y-3">
        {recommendations.map((rec, i) => {
          const key    = `${rec.type}-${i}`
          const state  = statuses[key] ?? 'idle'
          const errMsg = errors[key] ?? ''

          return (
            <div
              key={key}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_BADGE[rec.priority]}`}>
                      {PRIORITY_LABEL[rec.priority]}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {rec.title}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">
                    {rec.description}
                  </p>
                  <p className="text-xs text-blue-500 mt-1">
                    ↳ {rec.impact}
                  </p>
                  {errMsg && (
                    <p className="text-xs text-red-500 mt-1">⚠ {errMsg}</p>
                  )}
                </div>

                {rec.endpoint && (
                  <button
                    onClick={() => handleAction(rec, key)}
                    disabled={state === 'loading'}
                    className={[
                      'flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-all',
                      state === 'idle'    ? 'bg-blue-600 hover:bg-blue-700 text-white'          : '',
                      state === 'loading' ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed' : '',
                      state === 'ok'      ? 'bg-green-500 text-white'                           : '',
                      state === 'error'   ? 'bg-red-500 text-white'                             : '',
                    ].join(' ')}
                  >
                    {state === 'idle'    && 'Ejecutar'}
                    {state === 'loading' && 'Ejecutando…'}
                    {state === 'ok'      && '✓ Iniciado'}
                    {state === 'error'   && 'Error'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
