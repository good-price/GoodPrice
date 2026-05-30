/**
 * components/ops/JobCenter.tsx
 *
 * Unified job monitoring panel — polling client component.
 *
 * Polls /api/ops/jobs every 5s.
 * Tabs: Running | Completed | Failed | All + Pipeline runs
 *
 * 'use client' — polling + tabs.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Local types (mirrors server ExecJob / ExecPipelineRun) ────────────────────

interface JobProgress {
  total:       number
  processed:   number
  repaired:    number
  suppressed:  number
  recovered:   number
  failed:      number
  durationMs:  number
  etaMs:       number | null
  currentProduct?: string
}

interface Job {
  id:          string
  type:        string
  status:      'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress:    JobProgress
  operator:    string
  startedAt:   string | null
  completedAt: string | null
  createdAt:   string
  result:      { summary?: string; warnings?: string[]; errors?: string[] } | null
  error:       string | null
  pipelineId?: string
}

interface Pipeline {
  id:           string
  name:         string
  status:       string
  currentStage: number
  totalStages:  number
  jobIds:       string[]
  startedAt:    string
  completedAt:  string | null
}

type Tab = 'running' | 'completed' | 'failed' | 'all'

// ── Helpers ───────────────────────────────────────────────────────────────────

const JOB_LABELS: Record<string, string> = {
  'trust-recompute':   'Trust Recompute',
  'repair':            'Image Repair',
  'live-truth':        'Live Truth',
  'link-audit':        'Link Audit',
  'colombia-audit':    'Colombia Audit',
  'self-healing':      'Self-Healing',
  'paapi-sync':        'PA-API Sync',
  'recovery-pipeline': 'Recovery Pipeline',
}

const STATUS_STYLE: Record<string, string> = {
  queued:    'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  running:   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  failed:    'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'En cola', running: 'Ejecutando', completed: 'Completado', failed: 'Fallido', cancelled: 'Cancelado',
}

const STAGE_LABELS: Record<string, string> = {
  'trust-recompute': 'Trust', 'repair': 'Repair', 'live-truth': 'Truth',
  'link-audit': 'Links', 'colombia-audit': 'Colombia', 'self-healing': 'Healing',
}

function fmtMs(ms: number): string {
  if (ms < 1_000)  return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`
}

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)    return `${Math.floor(ms / 1_000)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`
  return `${Math.floor(ms / 3_600_000)}h`
}

// ── Job row ────────────────────────────────────────────────────────────────────

function JobRow({ job }: { job: Job }) {
  const p       = job.progress
  const pct     = p.total > 0 ? Math.round((p.processed / p.total) * 100) : null
  const label   = JOB_LABELS[job.type] ?? job.type
  const badgeCls = STATUS_STYLE[job.status] ?? STATUS_STYLE.queued
  const badgeTxt = STATUS_LABEL[job.status] ?? job.status
  const isActive = job.status === 'running' || job.status === 'queued'

  return (
    <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-2">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${badgeCls} ${job.status === 'running' ? 'animate-pulse' : ''}`}>
          {badgeTxt}
        </span>
        <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">{label}</span>
        <span className="text-[9px] text-gray-400 dark:text-gray-600 font-mono flex-shrink-0">
          {relTime(job.completedAt ?? job.startedAt ?? job.createdAt)}
        </span>
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="mt-1.5 space-y-0.5">
          <div className="flex justify-between items-center text-[9px] text-gray-400">
            <span>{p.processed}/{p.total > 0 ? p.total : '?'}</span>
            {p.etaMs && p.etaMs > 0 && <span className="text-blue-400">ETA ~{fmtMs(p.etaMs)}</span>}
          </div>
          <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${job.status === 'running' ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              style={{ width: pct !== null ? `${pct}%` : '100%' }}
            />
          </div>
        </div>
      )}

      {/* Result */}
      {job.result?.summary && !isActive && (
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{job.result.summary}</p>
      )}

      {/* Error */}
      {job.error && (
        <p className="text-[10px] text-red-500 dark:text-red-400 mt-0.5 truncate">⚠ {job.error}</p>
      )}

      {/* Stats */}
      {!isActive && (p.recovered > 0 || p.repaired > 0 || p.suppressed > 0) && (
        <div className="flex gap-2 text-[9px] mt-0.5">
          {p.recovered  > 0 && <span className="text-blue-500">↑{p.recovered}</span>}
          {p.repaired   > 0 && <span className="text-green-500">✓{p.repaired}</span>}
          {p.suppressed > 0 && <span className="text-amber-500">↓{p.suppressed}</span>}
        </div>
      )}
    </div>
  )
}

// ── Pipeline strip ─────────────────────────────────────────────────────────────

function PipelineStrip({ pipeline }: { pipeline: Pipeline }) {
  const stageDots = pipeline.jobIds.map((id, i) => {
    const shortId = id.split('-')[0]
    let color = 'bg-gray-200 dark:bg-gray-700'
    if (pipeline.status === 'failed' && i === pipeline.currentStage) color = 'bg-red-400'
    else if (i < pipeline.currentStage) color = 'bg-green-400'
    else if (i === pipeline.currentStage && pipeline.status === 'running') color = 'bg-blue-400 animate-pulse'
    return { color, label: STAGE_LABELS[shortId] ?? `${i+1}` }
  })

  const dur = pipeline.completedAt
    ? fmtMs(new Date(pipeline.completedAt).getTime() - new Date(pipeline.startedAt).getTime())
    : ''

  const badgeCls = STATUS_STYLE[pipeline.status] ?? STATUS_STYLE.queued

  return (
    <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${badgeCls}`}>
          pipeline
        </span>
        <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">{pipeline.name}</span>
        <span className="text-[9px] text-gray-400 flex-shrink-0">
          {relTime(pipeline.startedAt)}
          {dur && ` · ${dur}`}
        </span>
      </div>
      <div className="flex gap-1">
        {stageDots.map((dot, i) => (
          <div key={i} className={`flex-1 h-1.5 rounded-full ${dot.color}`} title={dot.label} />
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const POLL_INTERVAL = 5_000

export function JobCenter() {
  const [jobs,      setJobs]      = useState<Job[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [locks,     setLocks]     = useState<string[]>([])
  const [tab,       setTab]       = useState<Tab>('running')
  const [loading,   setLoading]   = useState(true)

  const fetchJobs = useCallback(async () => {
    try {
      const res  = await fetch('/api/ops/jobs?limit=30', { cache: 'no-store' })
      const data = await res.json() as {
        ok:          boolean
        activeJobs:  Job[]
        recentJobs:  Job[]
        pipelines:   Pipeline[]
        activeLocks: string[]
      }
      if (data.ok) {
        const all = [...(data.activeJobs ?? []), ...(data.recentJobs ?? [])]
        // deduplicate
        const seen = new Set<string>()
        const deduped = all.filter(j => { if (seen.has(j.id)) return false; seen.add(j.id); return true })
        setJobs(deduped)
        setPipelines(data.pipelines ?? [])
        setLocks(data.activeLocks ?? [])
      }
    } catch { /* fail silently */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchJobs()
    const id = setInterval(fetchJobs, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchJobs])

  const running   = jobs.filter(j => j.status === 'running' || j.status === 'queued')
  const completed = jobs.filter(j => j.status === 'completed').slice(0, 10)
  const failed    = jobs.filter(j => j.status === 'failed').slice(0, 10)
  const all       = jobs.slice(0, 20)

  const tabJobs: Record<Tab, Job[]> = { running, completed, failed, all }
  const visible = tabJobs[tab]

  const TAB_DEFS: { id: Tab; label: string; count: number }[] = [
    { id: 'running',   label: 'Running',    count: running.length },
    { id: 'completed', label: 'Completado', count: completed.length },
    { id: 'failed',    label: 'Fallido',    count: failed.length },
    { id: 'all',       label: 'Todo',       count: all.length },
  ]

  return (
    <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Job Center</span>
          {running.length > 0 && (
            <span className="text-[9px] font-bold bg-blue-600 text-white rounded-full px-1.5 py-0.5 animate-pulse">
              {running.length} activo{running.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-[9px] text-gray-400">Actualiza cada {POLL_INTERVAL / 1000}s</span>
      </div>

      {/* Active locks */}
      {locks.length > 0 && (
        <div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 text-[10px] text-blue-600 dark:text-blue-400">
          🔒 Lock activo: <span className="font-mono font-semibold">{locks.join(', ')}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-gray-800">
        {TAB_DEFS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              'flex-1 text-[10px] font-medium py-2 transition-colors border-b-2 gap-1 flex items-center justify-center',
              tab === t.id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            ].join(' ')}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-[9px] rounded-full px-1 py-0.5 font-bold ${
                tab === t.id
                  ? t.id === 'failed' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Jobs list */}
      <div className="max-h-56 overflow-y-auto">
        {loading ? (
          <p className="text-[11px] text-gray-400 text-center py-4 animate-pulse">Cargando…</p>
        ) : visible.length === 0 ? (
          <p className="text-[11px] text-gray-400 dark:text-gray-600 text-center py-4">
            {tab === 'running' ? 'Sin jobs activos' :
             tab === 'failed'  ? 'Sin fallos recientes' :
             'Sin historial'}
          </p>
        ) : (
          visible.map(job => <JobRow key={job.id} job={job} />)
        )}
      </div>

      {/* Pipeline runs */}
      {pipelines.length > 0 && (
        <>
          <div className="px-3 py-1.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
            <p className="text-[9px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest">Pipelines</p>
          </div>
          <div className="max-h-32 overflow-y-auto">
            {pipelines.slice(0, 5).map(p => (
              <PipelineStrip key={p.id} pipeline={p} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
