/**
 * components/ops/JobProgressCard.tsx
 *
 * Displays a single job's execution state — status, progress bar, ETA.
 * Server Component — renders from ExecJob data passed as prop.
 *
 * Used by ActiveJobsPanel and the admin dashboard job history table.
 */

import type { ExecJob } from '@/lib/ops/execution'

// ── Helpers ───────────────────────────────────────────────────────────────────

const JOB_LABELS: Record<string, string> = {
  'trust-recompute':   'Trust Recompute',
  'repair':            'Repair Pipeline',
  'live-truth':        'Live Truth',
  'link-audit':        'Link Audit',
  'colombia-audit':    'Colombia Audit',
  'self-healing':      'Self-Healing',
  'paapi-sync':        'PA-API Sync',
  'recovery-pipeline': 'Recovery Pipeline',
}

const STATUS_STYLE: Record<string, string> = {
  queued:    'bg-gray-100 text-gray-500',
  running:   'bg-blue-100 text-blue-700 animate-pulse',
  completed: 'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-600',
  cancelled: 'bg-amber-100 text-amber-600',
}

const STATUS_LABEL: Record<string, string> = {
  queued:    'En cola',
  running:   'Ejecutando',
  completed: 'Completado',
  failed:    'Fallido',
  cancelled: 'Cancelado',
}

function fmtDuration(ms: number): string {
  if (ms < 1_000)  return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`
}

function fmtEta(etaMs: number | null): string | null {
  if (etaMs === null || etaMs <= 0) return null
  return `ETA ~${fmtDuration(etaMs)}`
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)     return 'hace menos de 1m'
  if (ms < 3_600_000)  return `hace ${Math.floor(ms / 60_000)}m`
  if (ms < 86_400_000) return `hace ${Math.floor(ms / 3_600_000)}h`
  return `hace ${Math.floor(ms / 86_400_000)}d`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  job:       ExecJob
  compact?:  boolean
}

export function JobProgressCard({ job, compact = false }: Props) {
  const p       = job.progress
  const pct     = p.total > 0 ? Math.round((p.processed / p.total) * 100) : null
  const label   = JOB_LABELS[job.type] ?? job.type
  const statusCls = STATUS_STYLE[job.status] ?? 'bg-gray-100 text-gray-500'
  const statusTxt = STATUS_LABEL[job.status] ?? job.status
  const eta       = fmtEta(p.etaMs)

  return (
    <div className={`bg-white border border-gray-100 rounded-xl p-4 shadow-sm ${compact ? '' : 'space-y-3'}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${statusCls}`}>
            {statusTxt}
          </span>
          <span className="text-sm font-semibold text-gray-800 truncate">{label}</span>
        </div>
        <span className="text-[10px] text-gray-400 flex-shrink-0">
          {job.startedAt ? relativeTime(job.startedAt) : relativeTime(job.createdAt)}
        </span>
      </div>

      {/* Progress bar (only for running/queued jobs with known total) */}
      {(job.status === 'running' || job.status === 'queued') && (
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-500">
              {p.processed}/{p.total > 0 ? p.total : '?'} productos
              {p.currentProduct && (
                <span className="text-gray-400 ml-1 font-mono text-[10px]">
                  · {p.currentProduct}
                </span>
              )}
            </span>
            {eta && (
              <span className="text-[10px] text-blue-500">{eta}</span>
            )}
          </div>
          <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: pct !== null ? `${pct}%` : '100%' }}
              role="progressbar"
              aria-valuenow={pct ?? 0}
              aria-valuemax={100}
            />
          </div>
        </div>
      )}

      {/* Result summary */}
      {!compact && job.result?.summary && (
        <p className="text-[11px] text-gray-600 leading-relaxed">
          {job.result.summary}
        </p>
      )}

      {/* Error */}
      {job.error && (
        <p className="text-[11px] text-red-500 font-mono truncate">
          ⚠ {job.error}
        </p>
      )}

      {/* Stats row */}
      {!compact && p.processed > 0 && (
        <div className="flex flex-wrap gap-3 text-[10px] text-gray-400 border-t border-gray-50 pt-2">
          {p.repaired   > 0 && <span className="text-green-600">↑ {p.repaired} reparados</span>}
          {p.recovered  > 0 && <span className="text-blue-600">↑ {p.recovered} recuperados</span>}
          {p.suppressed > 0 && <span className="text-amber-500">↓ {p.suppressed} suprimidos</span>}
          {p.failed     > 0 && <span className="text-red-400">✗ {p.failed} fallidos</span>}
          {p.durationMs > 0 && <span className="ml-auto">{fmtDuration(p.durationMs)}</span>}
        </div>
      )}
    </div>
  )
}
