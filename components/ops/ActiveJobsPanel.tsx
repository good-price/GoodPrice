/**
 * components/ops/ActiveJobsPanel.tsx
 *
 * Shows all currently active (queued/running) jobs and recent pipeline runs.
 * Server Component — reads from execution store at render time.
 *
 * For live polling, wrap in a client component that refreshes on interval.
 */

import { getActiveJobs, getRecentJobs, getRecentPipelines, getActiveLocks } from '@/lib/ops/execution'
import { JobProgressCard } from './JobProgressCard'
import { PipelineCard }    from './PipelineCard'

// ── Component ─────────────────────────────────────────────────────────────────

export function ActiveJobsPanel() {
  const active    = getActiveJobs()
  const recent    = getRecentJobs(8).filter(j => j.status !== 'queued' && j.status !== 'running')
  const pipelines = getRecentPipelines(3)
  const locks     = getActiveLocks()

  const hasActive   = active.length > 0
  const hasRecent   = recent.length > 0
  const hasPipelines = pipelines.length > 0

  return (
    <div className="space-y-4">
      {/* Active locks indicator */}
      {locks.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-blue-600 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
          <span>
            Bloqueado activo: <span className="font-mono font-semibold">{locks.join(', ')}</span>
          </span>
        </div>
      )}

      {/* Active jobs */}
      {hasActive ? (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            En ejecución ({active.length})
          </p>
          {active.map(job => (
            <JobProgressCard key={job.id} job={job} />
          ))}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400">Sin jobs activos</p>
          <p className="text-xs text-gray-300 mt-1">
            Usa el panel de acciones para ejecutar operaciones
          </p>
        </div>
      )}

      {/* Recent pipeline runs */}
      {hasPipelines && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Pipelines recientes
          </p>
          {pipelines.map(run => (
            <PipelineCard key={run.id} run={run} />
          ))}
        </div>
      )}

      {/* Recent job history */}
      {hasRecent && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Historial reciente
          </p>
          {recent.map(job => (
            <JobProgressCard key={job.id} job={job} compact />
          ))}
        </div>
      )}

      {!hasActive && !hasRecent && !hasPipelines && (
        <p className="text-[10px] text-gray-300 text-center py-2">
          No hay historial de ejecución todavía.
        </p>
      )}
    </div>
  )
}
