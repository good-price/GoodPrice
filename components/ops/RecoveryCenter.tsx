/**
 * components/ops/RecoveryCenter.tsx
 *
 * Main recovery center for the GOODPRICE OPS workspace.
 * Shows the "Recover Catalog" CTA with a live progress tracker.
 *
 * Polls /api/ops/recovery/status every 3s during active recovery.
 * 'use client' — polling + state.
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  RecoveryRun,
  RecoveryStageInfo,
  VisibilityAuditResult,
} from '@/lib/ops/activation/types'

interface Props {
  initialRun?:   RecoveryRun | null
  initialAudit?: VisibilityAuditResult | null
}

// ── Stage status display ──────────────────────────────────────────────────────

const STAGE_COLORS = {
  pending:   'text-gray-500  bg-gray-800',
  running:   'text-purple-300 bg-purple-900/40',
  completed: 'text-green-300  bg-green-900/30',
  failed:    'text-red-300    bg-red-900/30',
  skipped:   'text-gray-600  bg-gray-800/50',
} as const

const STAGE_ICONS = {
  pending:   '○',
  running:   '⟳',
  completed: '✓',
  failed:    '✕',
  skipped:   '—',
} as const

function StageRow({ stage }: { stage: RecoveryStageInfo }) {
  const color = STAGE_COLORS[stage.status] ?? STAGE_COLORS.pending
  const icon  = STAGE_ICONS[stage.status]  ?? '○'

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[11px] transition-all ${color}`}>
      <span className={`flex-shrink-0 text-base ${stage.status === 'running' ? 'animate-spin' : ''}`}>
        {icon}
      </span>
      <span className="flex-1 font-medium">{stage.label}</span>
      {stage.durationMs && (
        <span className="text-[9px] font-mono opacity-70">
          {stage.durationMs < 1000
            ? `${stage.durationMs}ms`
            : `${(stage.durationMs / 1000).toFixed(1)}s`}
        </span>
      )}
      {stage.summary && (
        <span className="text-[9px] opacity-60 truncate max-w-[120px]">{stage.summary}</span>
      )}
    </div>
  )
}

// ── Visibility diff ───────────────────────────────────────────────────────────

function VisibilityDiff({ before, after }: {
  before: RecoveryRun['before']
  after:  RecoveryRun['after']
}) {
  if (!before || !after) return null

  const visibleBefore = before.active + before.warning + before.degraded
  const visibleAfter  = after.active  + after.warning  + after.degraded
  const delta         = visibleAfter - visibleBefore
  const suppDelta     = after.suppressed - before.suppressed

  return (
    <div className="grid grid-cols-2 gap-3 text-center">
      <div>
        <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Antes</p>
        <p className="text-2xl font-black text-gray-400 tabular-nums">{visibleBefore}</p>
        <p className="text-[9px] text-gray-600">visibles · {before.suppressed} suprimidos</p>
        <div className="mt-1 text-[10px]">
          <span className="text-green-500">{before.active}</span>
          <span className="text-yellow-400 ml-1">{before.warning}</span>
          <span className="text-orange-400 ml-1">{before.degraded}</span>
        </div>
      </div>
      <div>
        <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Después</p>
        <p className={`text-2xl font-black tabular-nums ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {visibleAfter}
        </p>
        <p className="text-[9px] text-gray-600">visibles · {after.suppressed} suprimidos</p>
        <div className="mt-1 text-[10px]">
          <span className="text-green-500">{after.active}</span>
          <span className="text-yellow-400 ml-1">{after.warning}</span>
          <span className="text-orange-400 ml-1">{after.degraded}</span>
        </div>
      </div>

      {/* Delta summary */}
      <div className="col-span-2 flex items-center justify-center gap-4 pt-1 border-t border-gray-800">
        <span className={`text-xs font-bold ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {delta >= 0 ? `+${delta}` : delta} visibles
        </span>
        <span className={`text-xs font-bold ${suppDelta <= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {suppDelta <= 0 ? `${suppDelta}` : `+${suppDelta}`} suprimidos
        </span>
        {after.healthScore !== before.healthScore && (
          <span className={`text-xs font-bold ${after.healthScore > before.healthScore ? 'text-blue-400' : 'text-gray-500'}`}>
            {after.healthScore > before.healthScore ? '+' : ''}{after.healthScore - before.healthScore} health
          </span>
        )}
      </div>
    </div>
  )
}

// ── ETA display ───────────────────────────────────────────────────────────────

function useElapsed(startedAt: string | null): number {
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!startedAt) { setElapsed(0); return }
    const update = () => setElapsed(Date.now() - new Date(startedAt).getTime())
    update()
    intervalRef.current = setInterval(update, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [startedAt])

  return elapsed
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

// ── Main component ────────────────────────────────────────────────────────────

const POLL_INTERVAL = 3_000

export function RecoveryCenter({ initialRun = null, initialAudit = null }: Props) {
  const [run,       setRun]       = useState<RecoveryRun | null>(initialRun)
  const [audit,     setAudit]     = useState<VisibilityAuditResult | null>(initialAudit)
  const [isActive,  setIsActive]  = useState(initialRun?.status === 'running')
  const [launching, setLaunching] = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const elapsed = useElapsed(isActive ? run?.startedAt ?? null : null)

  // Poll status while active
  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch('/api/ops/recovery/status', { cache: 'no-store' })
      const data = await res.json() as { ok: boolean; run: RecoveryRun | null; isActive: boolean; audit: VisibilityAuditResult }
      if (data.ok) {
        setRun(data.run)
        setIsActive(data.isActive)
        setAudit(data.audit)
      }
    } catch { /* fail silently */ }
  }, [])

  useEffect(() => {
    if (!isActive) return
    const id = setInterval(fetchStatus, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [isActive, fetchStatus])

  // Launch recovery
  const handleRecover = useCallback(async () => {
    if (launching || isActive) return
    setLaunching(true)
    setError(null)

    // Start polling immediately so stage dots and progress bar update
    // while the synchronous pipeline runs server-side writing to recovery.json
    setIsActive(true)

    try {
      const res  = await fetch('/api/ops/recovery', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ operator: 'admin' }),
      })
      const data = await res.json() as { ok: boolean; error?: string; run?: RecoveryRun }

      if (!data.ok) {
        setError(data.error ?? 'Error al iniciar recovery')
        setIsActive(false)   // abort polling — recovery did not start
        setLaunching(false)
        return
      }

      if (data.run) setRun(data.run)
      // Pipeline is synchronous — response arrives with 'completed'/'failed',
      // not 'running'. Stop the polling that was already running.
      setIsActive(data.run?.status === 'running')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red')
      setIsActive(false)   // abort polling on network error
    } finally {
      setLaunching(false)
    }
  }, [launching, isActive])

  // Stage progress
  const completedStages = run?.stages.filter(s => s.status === 'completed').length ?? 0
  const totalStages     = run?.stages.length ?? 0
  const progressPct     = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0

  const currentStage = run?.stages.find(s => s.status === 'running')

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div>
          <h3 className="text-sm font-bold text-gray-100">Recovery Center</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Pipeline completo: trust → repair → live-truth → link-audit → colombia → healing
          </p>
        </div>
        {run?.status === 'completed' && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-900/40 text-green-300 border border-green-800">
            ✓ Completado
          </span>
        )}
        {run?.status === 'failed' && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-800">
            ✕ Fallido
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Launch button */}
        {!isActive && (
          <button
            onClick={handleRecover}
            disabled={launching}
            className={[
              'w-full py-3 px-4 rounded-xl text-sm font-bold transition-all duration-150',
              'flex items-center justify-center gap-2',
              launching
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg hover:shadow-blue-900/40',
            ].join(' ')}
          >
            {launching ? (
              <>
                <span className="animate-spin text-base">⟳</span>
                Iniciando…
              </>
            ) : (
              <>
                <span className="text-base">🚀</span>
                Recover Catalog
              </>
            )}
          </button>
        )}

        {/* Active progress */}
        {isActive && (
          <div className="space-y-3">
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-purple-300 font-medium">
                  {currentStage ? `Ejecutando: ${currentStage.label}` : 'Iniciando…'}
                </span>
                <span className="text-[10px] font-mono text-gray-500">{fmtElapsed(elapsed)}</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-[9px] text-gray-600 mt-1">
                {completedStages} / {totalStages} etapas · {progressPct}%
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-3 py-2 bg-red-900/20 border border-red-800 rounded-lg text-[11px] text-red-300">
            ⚠ {error}
          </div>
        )}

        {/* Stage list */}
        {run && (
          <div className="space-y-1">
            {run.stages.map(stage => (
              <StageRow key={stage.stage} stage={stage} />
            ))}
          </div>
        )}

        {/* Before / after */}
        {run?.status === 'completed' && run.before && run.after && (
          <div className="border-t border-gray-800 pt-4">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
              Impacto del Recovery
            </p>
            <VisibilityDiff before={run.before} after={run.after} />
          </div>
        )}

        {/* Current visibility when idle */}
        {!run && audit && (
          <div className="border-t border-gray-800 pt-3">
            <p className="text-[10px] text-gray-600 mb-2">Estado actual del catálogo</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: 'Active',    count: audit.active,    cls: 'text-green-400' },
                { label: 'Warning',   count: audit.warning,   cls: 'text-yellow-400' },
                { label: 'Degraded',  count: audit.degraded,  cls: 'text-orange-400' },
                { label: 'Suprimidos',count: audit.suppressed,cls: 'text-red-400' },
              ].map(({ label, count, cls }) => (
                <div key={label}>
                  <p className={`text-xl font-bold tabular-nums ${cls}`}>{count}</p>
                  <p className="text-[9px] text-gray-600">{label}</p>
                </div>
              ))}
            </div>
            {(audit.alertSuppressed || audit.alertVisible) && (
              <div className="mt-2 space-y-1">
                {audit.alerts.map((alert, i) => (
                  <p key={i} className="text-[10px] text-yellow-400">⚠ {alert}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
