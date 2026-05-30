/**
 * components/ops/ExecutionInsightsPanel.tsx
 *
 * Displays execution health insights: success rates per job type,
 * stalled queues, failure patterns, and actionable recommendations.
 *
 * 'use client' — action execution + state.
 */

'use client'

import { useState, useCallback } from 'react'
import type {
  ExecutionInsights,
  ActivationRecommendation,
} from '@/lib/ops/activation/types'

interface Props {
  initialInsights?:       ExecutionInsights | null
  initialRecommendations?: ActivationRecommendation[]
}

const PRIORITY_COLORS = {
  immediate: 'border-red-800 bg-red-900/20 text-red-300',
  high:      'border-orange-800 bg-orange-900/20 text-orange-300',
  medium:    'border-yellow-800 bg-yellow-900/20 text-yellow-300',
  low:       'border-gray-700 bg-gray-800/30 text-gray-400',
} as const

const PRIORITY_ICONS = {
  immediate: '🔴',
  high:      '🟠',
  medium:    '🟡',
  low:       '⚪',
} as const

function fmtDuration(ms: number): string {
  if (ms === 0) return '—'
  if (ms < 1_000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m`
}

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`
  return `${Math.floor(ms / 86_400_000)}d`
}

function JobTypeRow({ insight }: { insight: ExecutionInsights['byType'][0] }) {
  const color =
    insight.successRate >= 90 ? 'text-green-400' :
    insight.successRate >= 70 ? 'text-yellow-400' :
    insight.successRate >= 50 ? 'text-orange-400' :
    'text-red-400'

  return (
    <div className="flex items-center gap-3 px-2 py-1.5">
      <span className="text-[10px] text-gray-300 font-medium flex-1 truncate">{insight.label}</span>
      <span className={`text-[10px] font-bold tabular-nums w-10 text-right ${color}`}>
        {insight.successRate}%
      </span>
      <span className="text-[9px] text-gray-600 w-10 text-right tabular-nums">
        {fmtDuration(insight.avgDurationMs)}
      </span>
      <span className="text-[9px] text-gray-700 w-8 text-right">
        {insight.lastRunAt ? relTime(insight.lastRunAt) : '—'}
      </span>
    </div>
  )
}

function RecommendationCard({
  rec,
  onExecute,
  executing,
  feedback,
}: {
  rec:       ActivationRecommendation
  onExecute: (rec: ActivationRecommendation) => void
  executing: boolean
  feedback?: { ok: boolean; message: string }
}) {
  const colorCls = PRIORITY_COLORS[rec.priority] ?? PRIORITY_COLORS.low
  const icon     = PRIORITY_ICONS[rec.priority]  ?? '⚪'

  return (
    <div className={`border rounded-xl p-3 space-y-2 ${colorCls}`}>
      <div className="flex items-start gap-2">
        <span className="text-xs flex-shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold leading-tight">{rec.title}</p>
          <p className="text-[10px] opacity-70 leading-snug mt-0.5">{rec.description}</p>
          <p className="text-[9px] opacity-50 mt-1">→ {rec.impact}</p>
        </div>
      </div>

      {feedback ? (
        <p className={`text-[10px] ${feedback.ok ? 'text-green-300' : 'text-red-300'}`}>
          {feedback.ok ? '✓' : '✕'} {feedback.message}
        </p>
      ) : (
        rec.endpoint && (
          <button
            onClick={() => onExecute(rec)}
            disabled={executing}
            className="w-full py-1.5 px-2 rounded-lg bg-black/20 hover:bg-black/30 text-[10px] font-medium disabled:opacity-40 transition-colors text-current"
          >
            {executing ? '⟳ Ejecutando…' : 'Ejecutar →'}
          </button>
        )
      )}
    </div>
  )
}

export function ExecutionInsightsPanel({
  initialInsights       = null,
  initialRecommendations = [],
}: Props) {
  const [insights, setInsights]   = useState<ExecutionInsights | null>(initialInsights)
  const [recs,     setRecs]       = useState<ActivationRecommendation[]>(initialRecommendations)
  const [executing, setExecuting] = useState<string | null>(null)
  const [feedbacks, setFeedbacks] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [tab,       setTab]       = useState<'recs' | 'jobs'>('recs')

  const refresh = useCallback(async () => {
    try {
      const res  = await fetch('/api/ops/recovery/report', { cache: 'no-store' })
      const data = await res.json() as {
        ok: boolean
        report: { insights: ExecutionInsights; recommendations: ActivationRecommendation[] }
      }
      if (data.ok) {
        setInsights(data.report.insights)
        setRecs(data.report.recommendations)
      }
    } catch { /* ignore */ }
  }, [])

  const executeRec = useCallback(async (rec: ActivationRecommendation) => {
    if (!rec.endpoint || executing) return
    setExecuting(rec.id)
    try {
      const res  = await fetch(rec.endpoint, {
        method:  rec.method ?? 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    rec.method !== 'GET' ? JSON.stringify(rec.body ?? { operator: 'admin' }) : undefined,
      })
      const data = await res.json() as { ok: boolean; error?: string; result?: { summary?: string } }
      setFeedbacks(f => ({
        ...f,
        [rec.id]: {
          ok:      data.ok,
          message: data.ok
            ? (data.result?.summary ?? 'Ejecutado correctamente')
            : (data.error ?? 'Error desconocido'),
        },
      }))
      if (data.ok) {
        setTimeout(() => {
          setFeedbacks(f => { const n = { ...f }; delete n[rec.id]; return n })
          refresh()
        }, 3000)
      }
    } catch {
      setFeedbacks(f => ({ ...f, [rec.id]: { ok: false, message: 'Error de red' } }))
    } finally {
      setExecuting(null)
    }
  }, [executing, refresh])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div>
          <h3 className="text-sm font-bold text-gray-100">Execution Insights</h3>
          {insights && (
            <p className="text-[10px] text-gray-500">
              {insights.totalJobs} jobs · {insights.successRate}% éxito · avg {fmtDuration(insights.avgDurationMs)}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          {(['recs', 'jobs'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'text-[10px] px-2 py-0.5 rounded transition-colors',
                tab === t ? 'bg-gray-700 text-gray-200' : 'text-gray-600 hover:text-gray-400',
              ].join(' ')}
            >
              {t === 'recs' ? `Recs (${recs.length})` : 'Jobs'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {tab === 'recs' ? (
          <div className="space-y-2">
            {recs.length === 0 ? (
              <p className="text-[11px] text-green-400 text-center py-4">✓ Sin acciones recomendadas</p>
            ) : (
              recs.slice(0, 5).map(rec => (
                <RecommendationCard
                  key={rec.id}
                  rec={rec}
                  onExecute={executeRec}
                  executing={executing === rec.id}
                  feedback={feedbacks[rec.id]}
                />
              ))
            )}
          </div>
        ) : (
          <div>
            {/* Alerts */}
            {insights?.stalledQueues && insights.stalledQueues.length > 0 && (
              <div className="mb-3 px-3 py-2 bg-red-900/20 border border-red-800/50 rounded-lg">
                <p className="text-[10px] text-red-300">
                  ⚠ Colas estancadas: {insights.stalledQueues.join(', ')}
                </p>
              </div>
            )}
            {insights?.suppressionSpike && (
              <div className="mb-3 px-3 py-2 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
                <p className="text-[10px] text-yellow-300">
                  ⚠ Pico de supresión detectado en último trust recompute
                </p>
              </div>
            )}
            {insights?.bottleneck && (
              <div className="mb-3 px-3 py-2 bg-orange-900/20 border border-orange-800/50 rounded-lg">
                <p className="text-[10px] text-orange-300">
                  Cuello de botella: {insights.bottleneck}
                </p>
              </div>
            )}

            {/* Job type breakdown */}
            {insights && insights.byType.length > 0 ? (
              <div>
                <div className="flex items-center gap-3 px-2 pb-1 border-b border-gray-800">
                  <span className="text-[9px] text-gray-600 flex-1">Tipo</span>
                  <span className="text-[9px] text-gray-600 w-10 text-right">Éxito</span>
                  <span className="text-[9px] text-gray-600 w-10 text-right">Avg</span>
                  <span className="text-[9px] text-gray-600 w-8 text-right">Últ.</span>
                </div>
                {insights.byType.map(t => <JobTypeRow key={t.type} insight={t} />)}
              </div>
            ) : (
              <p className="text-[11px] text-gray-600 text-center py-4">Sin historial de jobs</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
