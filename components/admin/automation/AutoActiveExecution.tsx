/**
 * components/admin/automation/AutoActiveExecution.tsx
 *
 * Automation Center — Zona 3: ACTIVE EXECUTION
 *
 * Si hay ejecución activa: pipeline, stage, progreso, tiempo transcurrido.
 * Si no: "Sin automatizaciones activas".
 *
 * Server Component. elapsedMs calculado en la página al render time.
 */

import type { MasterCycleState } from '@/lib/ops/runtime'
import { MASTER_CYCLE }          from '@/lib/ops/cycle'
import { formatDuration }        from '@/lib/ops/time'

interface Props {
  cycleState: MasterCycleState
  elapsedMs:  number
}

const TOTAL_STAGES = MASTER_CYCLE.stages.length  // 6

const STAGE_LABELS: Record<string, string> = {
  'trust-recompute': 'Trust Recompute',
  'self-healing':    'Self Healing',
  'live-truth':      'Live Truth',
  'link-audit':      'Link Audit',
  'colombia-audit':  'Colombia Audit',
  'repair':          'Repair',
}

export function AutoActiveExecution({ cycleState, elapsedMs }: Props) {
  if (!cycleState.isRunning) {
    return (
      <section>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
          Ejecución Activa
        </p>
        <p className="text-sm text-gray-400">Sin automatizaciones activas</p>
      </section>
    )
  }

  const progressPct = cycleState.currentOrder !== null
    ? Math.round((cycleState.currentOrder / TOTAL_STAGES) * 100)
    : null

  const stageLabel = cycleState.currentStage
    ? (STAGE_LABELS[cycleState.currentStage] ?? cycleState.currentStage)
    : null

  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Ejecución Activa
      </p>

      <div className="grid grid-cols-[160px_1fr] gap-y-3 text-sm">

        <span className="text-gray-400">Estado</span>
        <span className="font-semibold text-yellow-600">● Ejecutando</span>

        {cycleState.pipelineId && (
          <>
            <span className="text-gray-400">Pipeline</span>
            <span className="font-mono text-[12px] text-gray-500">{cycleState.pipelineId}</span>
          </>
        )}

        {stageLabel && (
          <>
            <span className="text-gray-400">Stage actual</span>
            <span className="font-medium text-gray-800">{stageLabel}</span>
          </>
        )}

        {cycleState.currentOrder !== null && (
          <>
            <span className="text-gray-400">Progreso</span>
            <span className="text-gray-700">
              {cycleState.currentOrder} de {TOTAL_STAGES} etapas
              {progressPct !== null && (
                <span className="text-gray-400 ml-2">· {progressPct}%</span>
              )}
            </span>
          </>
        )}

        <span className="text-gray-400">Transcurrido</span>
        <span className="font-mono text-gray-800">{formatDuration(elapsedMs)}</span>

      </div>
    </section>
  )
}
