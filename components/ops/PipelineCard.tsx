/**
 * components/ops/PipelineCard.tsx
 *
 * Displays the state of a multi-stage pipeline run.
 * Server Component — renders from ExecPipelineRun data.
 */

import type { ExecPipelineRun } from '@/lib/ops/execution'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  'trust-recompute':   'Trust',
  'repair':            'Repair',
  'live-truth':        'Live Truth',
  'link-audit':        'Links',
  'colombia-audit':    'Colombia',
  'self-healing':      'Healing',
  'paapi-sync':        'PA-API',
}

const STATUS_STYLE: Record<string, { bg: string; text: string; ring: string }> = {
  queued:    { bg: 'bg-gray-100',  text: 'text-gray-500',  ring: 'ring-gray-200' },
  running:   { bg: 'bg-blue-100',  text: 'text-blue-700',  ring: 'ring-blue-300' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', ring: 'ring-green-300' },
  failed:    { bg: 'bg-red-100',   text: 'text-red-600',   ring: 'ring-red-300' },
  cancelled: { bg: 'bg-amber-100', text: 'text-amber-600', ring: 'ring-amber-300' },
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)     return 'hace menos de 1m'
  if (ms < 3_600_000)  return `hace ${Math.floor(ms / 60_000)}m`
  return `hace ${Math.floor(ms / 3_600_000)}h`
}

function fmtDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return ''
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (ms < 60_000) return `${(ms / 1_000).toFixed(0)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  run: ExecPipelineRun
}

export function PipelineCard({ run }: Props) {
  const s         = STATUS_STYLE[run.status] ?? STATUS_STYLE.queued
  const duration  = fmtDuration(run.startedAt, run.completedAt)

  // Derive per-stage state from currentStage and overall status
  const stages = Array.from({ length: run.totalStages }, (_, i) => {
    const stageType = (run as unknown as Record<string, unknown>)
    // Pipeline def stages aren't stored in the run — we just show position
    let stageStatus: 'done' | 'active' | 'pending' | 'failed' = 'pending'
    if (run.status === 'failed' && i === run.currentStage) stageStatus = 'failed'
    else if (i < run.currentStage) stageStatus = 'done'
    else if (i === run.currentStage && run.status === 'running') stageStatus = 'active'
    void stageType
    return { index: i, status: stageStatus }
  })

  // Map job IDs to short labels (stage 0, 1, 2…)
  const stageLabels = run.jobIds.map((id, i) => {
    const shortId = id.split('-')[0]  // first segment is the job type
    return STAGE_LABELS[shortId] ?? `Etapa ${i + 1}`
  })

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${s.bg} ${s.text} ${s.ring}`}>
            {run.status}
          </span>
          <span className="text-sm font-semibold text-gray-800">{run.name}</span>
        </div>
        <div className="text-right text-[10px] text-gray-400 flex-shrink-0">
          <span>{relativeTime(run.startedAt)}</span>
          {duration && <span className="ml-1 text-gray-300">· {duration}</span>}
        </div>
      </div>

      {/* Stage progress bar */}
      <div className="flex gap-1 mb-2">
        {stages.map((stage) => {
          const stageCls =
            stage.status === 'done'    ? 'bg-green-400' :
            stage.status === 'active'  ? 'bg-blue-400 animate-pulse' :
            stage.status === 'failed'  ? 'bg-red-400' :
            'bg-gray-100'
          return (
            <div
              key={stage.index}
              className={`flex-1 h-2 rounded-full ${stageCls}`}
              title={stageLabels[stage.index] ?? `Etapa ${stage.index + 1}`}
            />
          )
        })}
      </div>

      {/* Stage labels */}
      <div className="flex gap-1 text-[9px] text-gray-400">
        {stages.map((stage, i) => (
          <div key={stage.index} className="flex-1 text-center truncate">
            {stageLabels[i] ?? `${i + 1}`}
          </div>
        ))}
      </div>

      {/* Progress text */}
      <p className="text-[11px] text-gray-500 mt-2">
        {run.currentStage < run.totalStages
          ? `Etapa ${run.currentStage + 1}/${run.totalStages}`
          : `${run.totalStages} etapas`}
        {run.status === 'running' && ' — en progreso…'}
        {run.status === 'completed' && ' — completado ✓'}
        {run.status === 'failed' && ' — falló en esta etapa'}
        {run.status === 'cancelled' && ' — cancelado'}
      </p>
    </div>
  )
}
