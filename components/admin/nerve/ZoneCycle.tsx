/**
 * components/admin/nerve/ZoneCycle.tsx
 *
 * Nerve Center — Zona 2: CICLO MAESTRO
 *
 * Si isRunning: stage actual, pipeline, transcurrido, progreso.
 * Si en reposo: último estado, duración, hace cuánto terminó.
 *
 * Server Component. elapsedMs se calcula en la página al render time.
 */

import Link from 'next/link'
import type { MasterCycleState } from '@/lib/ops/runtime'
import { MASTER_CYCLE }          from '@/lib/ops/cycle'
import { formatDuration }        from '@/lib/ops/time'

interface Props {
  state:     MasterCycleState
  elapsedMs: number
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  success:   { label: 'SUCCESS',   cls: 'text-green-600' },
  partial:   { label: 'PARTIAL',   cls: 'text-yellow-600' },
  failed:    { label: 'FAILED',    cls: 'text-red-500' },
  cancelled: { label: 'CANCELLED', cls: 'text-gray-400' },
}

const TOTAL_STAGES = MASTER_CYCLE.stages.length  // 6

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)     return 'ahora mismo'
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m atrás`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h atrás`
  return `${Math.floor(ms / 86_400_000)}d atrás`
}

export function ZoneCycle({ state, elapsedMs }: Props) {
  const lastMeta = state.lastStatus
    ? (STATUS_META[state.lastStatus] ?? { label: state.lastStatus.toUpperCase(), cls: 'text-gray-400' })
    : null

  const progressPct = state.isRunning && state.currentOrder !== null
    ? Math.round((state.currentOrder / TOTAL_STAGES) * 100)
    : null

  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Ciclo Maestro
      </p>

      <div className="grid grid-cols-[160px_1fr] gap-y-3 text-sm">

        <span className="text-gray-400">Estado</span>
        {state.isRunning ? (
          <span className="font-semibold text-yellow-600">● Ejecutando</span>
        ) : (
          <span className="text-gray-500">○ En reposo</span>
        )}

        {/* ── Running path ──────────────────────────────────────────── */}
        {state.isRunning && (
          <>
            {state.currentStage && (
              <>
                <span className="text-gray-400">Stage actual</span>
                <span className="font-mono text-gray-800">{state.currentStage}</span>
              </>
            )}

            {state.currentOrder !== null && (
              <>
                <span className="text-gray-400">Progreso</span>
                <span className="text-gray-700">
                  {state.currentOrder} de {TOTAL_STAGES} etapas
                  {progressPct !== null && (
                    <span className="text-gray-400 ml-2">· {progressPct}%</span>
                  )}
                </span>
              </>
            )}

            {state.pipelineId && (
              <>
                <span className="text-gray-400">Pipeline</span>
                <span className="font-mono text-[12px] text-gray-500">{state.pipelineId}</span>
              </>
            )}

            <span className="text-gray-400">Transcurrido</span>
            <span className="font-mono text-gray-800">{formatDuration(elapsedMs)}</span>
          </>
        )}

        {/* ── Idle path ─────────────────────────────────────────────── */}
        {!state.isRunning && lastMeta && (
          <>
            <span className="text-gray-400">Último</span>
            <span>
              <span className={`font-bold text-[12px] ${lastMeta.cls}`}>
                {lastMeta.label}
              </span>
              {state.lastDurationMs > 0 && (
                <span className="text-gray-400 font-normal ml-2">
                  · {formatDuration(state.lastDurationMs)}
                </span>
              )}
            </span>

            {state.lastCompletedAt && (
              <>
                <span className="text-gray-400">Completó</span>
                <span className="text-gray-500">{relativeTime(state.lastCompletedAt)}</span>
              </>
            )}
          </>
        )}

        {!state.isRunning && !lastMeta && (
          <>
            <span className="text-gray-400">Último</span>
            <span className="text-gray-400">Sin ciclos ejecutados</span>
          </>
        )}

      </div>

      <div className="mt-5 text-right">
        <Link
          href="/admin/automation"
          className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
        >
          Automation Center →
        </Link>
      </div>
    </section>
  )
}
