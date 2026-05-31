/**
 * components/ops/ExecutionConsole.tsx
 *
 * Execution console panel for the GOODPRICE OPS workspace.
 * Shows active jobs with progress bars and a recent-jobs log.
 * Polls /api/ops/jobs every 5 seconds for live updates.
 *
 * 'use client' — polling + interactive expansion.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import type { WorkspaceJob }                from '@/lib/ops/workspace/types'

interface Props {
  initialActiveJobs:  WorkspaceJob[]
  initialRecentJobs?: WorkspaceJob[]
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function fmtDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1_000)  return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1_000)}s`
}

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)     return `${Math.floor(ms / 1_000)}s`
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m`
  return `${Math.floor(ms / 3_600_000)}h`
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  pending:   'bg-gray-800 text-gray-400',
  running:   'bg-purple-900/60 text-purple-300',
  completed: 'bg-green-900/60 text-green-300',
  failed:    'bg-red-900/60 text-red-300',
  cancelled: 'bg-gray-800 text-gray-500',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${STATUS_BADGE[status] ?? STATUS_BADGE.pending}`}>
      {status}
    </span>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ progress, status }: { progress: number; status: string }) {
  const barColor =
    status === 'failed'    ? 'bg-red-500' :
    status === 'completed' ? 'bg-green-500' :
    status === 'running'   ? 'bg-purple-500' :
    'bg-gray-600'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-800 rounded-full h-1 overflow-hidden">
        <div
          className={`${barColor} h-1 rounded-full transition-all duration-500`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-[9px] font-mono text-gray-500 w-8 text-right">{progress}%</span>
    </div>
  )
}

// ── Job row ───────────────────────────────────────────────────────────────────

function JobRow({ job, expanded = false }: { job: WorkspaceJob; expanded?: boolean }) {
  const [open, setOpen] = useState(expanded)

  return (
    <div className="border-b border-gray-800/60 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-800/40 transition-colors"
      >
        {/* Status spinner or icon */}
        <span className={`text-xs flex-shrink-0 ${job.status === 'running' ? 'animate-spin text-purple-400' : 'text-gray-600'}`}>
          {job.status === 'completed' ? '✓' :
           job.status === 'failed'    ? '✕' :
           job.status === 'running'   ? '⟳' :
           job.status === 'cancelled' ? '○' :
           '·'}
        </span>

        {/* Label + status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-medium text-gray-200 truncate">{job.label}</p>
            <StatusBadge status={job.status} />
          </div>
          {(job.status === 'running' || job.status === 'pending') && (
            <ProgressBar progress={job.progress} status={job.status} />
          )}
        </div>

        {/* Time */}
        <span className="text-[9px] text-gray-600 flex-shrink-0 font-mono">
          {job.completedAt
            ? relTime(job.completedAt)
            : job.startedAt
            ? relTime(job.startedAt)
            : '—'}
        </span>

        {/* Expand toggle */}
        <span className="text-[9px] text-gray-700">{open ? '▴' : '▾'}</span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-8 pb-3 space-y-1.5">
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <p className="text-gray-600 uppercase tracking-wide">Duración</p>
              <p className="text-gray-300 font-mono">{fmtDuration(job.durationMs)}</p>
            </div>
            <div>
              <p className="text-gray-600 uppercase tracking-wide">Operador</p>
              <p className="text-gray-300">{job.operator}</p>
            </div>
            <div>
              <p className="text-gray-600 uppercase tracking-wide">Job ID</p>
              <p className="text-gray-500 font-mono truncate">{job.id}</p>
            </div>
          </div>
          {job.summary && (
            <p className="text-[10px] text-gray-400 leading-snug">{job.summary}</p>
          )}
          {job.warnings.length > 0 && (
            <div className="space-y-0.5">
              {job.warnings.map((w, i) => (
                <p key={i} className="text-[10px] text-yellow-400">⚠ {w}</p>
              ))}
            </div>
          )}
          {job.errors.length > 0 && (
            <div className="space-y-0.5">
              {job.errors.map((e, i) => (
                <p key={i} className="text-[10px] text-red-400">✕ {e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const POLL_INTERVAL = 5_000

export function ExecutionConsole({ initialActiveJobs, initialRecentJobs = [] }: Props) {
  const [activeJobs,  setActiveJobs]  = useState<WorkspaceJob[]>(initialActiveJobs)
  const [recentJobs]                  = useState<WorkspaceJob[]>(initialRecentJobs)
  const [tab,         setTab]         = useState<'active' | 'recent'>('active')

  const fetchJobs = useCallback(async () => {
    try {
      // /api/ops/live returns snapshot.activeJobs already in WorkspaceJob format
      // (converted by getWorkspaceActiveJobs → toWorkspaceJob in execution-stream.ts)
      const res  = await fetch('/api/ops/live', { cache: 'no-store' })
      const data = await res.json() as { ok: boolean; snapshot: { activeJobs: WorkspaceJob[] } }
      if (data.ok && data.snapshot) {
        setActiveJobs(data.snapshot.activeJobs ?? [])
      }
    } catch { /* fail silently */ }
  }, [])

  useEffect(() => {
    const id = setInterval(fetchJobs, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchJobs])

  const activeCount = activeJobs.length

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Execution Console
          </p>
          {activeCount > 0 && (
            <span className="bg-purple-600 text-white text-[9px] font-bold rounded-full px-1.5 min-w-[16px] text-center">
              {activeCount}
            </span>
          )}
        </div>
        {/* Tab switcher */}
        <div className="flex gap-1">
          {(['active', 'recent'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'text-[10px] px-2 py-0.5 rounded transition-colors capitalize',
                tab === t
                  ? 'bg-gray-700 text-gray-200'
                  : 'text-gray-600 hover:text-gray-400',
              ].join(' ')}
            >
              {t === 'active' ? `Active${activeCount > 0 ? ` (${activeCount})` : ''}` : 'Recent'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-h-72 overflow-y-auto">
        {tab === 'active' ? (
          activeJobs.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[11px] text-gray-600">Sin jobs activos</p>
              <p className="text-[10px] text-gray-700 mt-1">Los jobs se mostrarán aquí al ejecutarlos.</p>
            </div>
          ) : (
            activeJobs.map(job => (
              <JobRow key={job.id} job={job} expanded={job.status === 'running'} />
            ))
          )
        ) : (
          recentJobs.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[11px] text-gray-600">Sin jobs recientes</p>
            </div>
          ) : (
            recentJobs.map(job => (
              <JobRow key={job.id} job={job} />
            ))
          )
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-gray-800">
        <p className="text-[9px] text-gray-700">Actualiza cada {POLL_INTERVAL / 1_000}s</p>
      </div>
    </div>
  )
}
