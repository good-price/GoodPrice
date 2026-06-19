/**
 * components/admin/activity/ActivityLog.tsx
 *
 * Activity Center — Zona 2: ACTIVIDAD RECIENTE
 *
 * Tabla de los últimos N eventos con expand/collapse por fila.
 * Expand via <details>/<summary> — HTML nativo, sin JavaScript ni Client Component.
 *
 * Expandido muestra: Summary · Notes · Warnings · Errors · Pipeline · Actions.
 *
 * Server Component.
 */

import type { OpsLog } from '@/lib/ops/logs'
import { formatDuration } from '@/lib/ops/time'

interface Props {
  logs: OpsLog[]
}

const STATUS_META: Record<string, { icon: string; label: string; cls: string }> = {
  success:   { icon: '✓', label: 'Success',   cls: 'text-green-600' },
  partial:   { icon: '~', label: 'Partial',   cls: 'text-yellow-600' },
  failed:    { icon: '✗', label: 'Failed',    cls: 'text-red-500' },
  cancelled: { icon: '—', label: 'Cancelled', cls: 'text-gray-400' },
}

const JOB_LABELS: Record<string, string> = {
  'cycle-3am':      'Ciclo 3AM',
  'trust-recompute': 'Trust Recompute',
  'self-healing':   'Self Healing',
  'live-truth':     'Live Truth',
  'link-audit':     'Link Audit',
  'colombia-audit': 'Colombia Audit',
  'repair':         'Repair',
  'paapi-sync':     'PAAPI Sync',
  'trm-update':     'TRM Update',
  'recovery-pipeline': 'Recovery',
  'manual-action':  'Manual',
}

function bogotaHHMM(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
    timeZone: 'America/Bogota',
  }).format(new Date(iso))
}

function actionCount(arr: string[]): number {
  return arr.length
}

export function ActivityLog({ logs }: Props) {
  if (logs.length === 0) {
    return (
      <section>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
          Actividad Reciente
        </p>
        <p className="text-sm text-gray-400">Sin eventos registrados</p>
      </section>
    )
  }

  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Actividad Reciente
      </p>

      {/* Column headers */}
      <div className="grid grid-cols-[56px_140px_110px_80px_1fr] gap-x-3 px-1 pb-2 border-b border-gray-100">
        {(['Hora', 'Tipo', 'Estado', 'Duración', 'Resumen'] as const).map(h => (
          <span key={h} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            {h}
          </span>
        ))}
      </div>

      <div className="divide-y divide-gray-50">
        {logs.map(log => {
          const meta     = STATUS_META[log.status] ?? STATUS_META['cancelled']!
          const label    = JOB_LABELS[log.jobType] ?? log.jobType
          const hasNotes = log.notes.trim().length > 0
          const removed    = actionCount(log.actions.removed)
          const repaired   = actionCount(log.actions.repaired)
          const suppressed = actionCount(log.actions.suppressed)
          const recovered  = actionCount(log.actions.recovered)
          const flagged    = actionCount(log.actions.flagged)
          const hasActions = removed + repaired + suppressed + recovered + flagged > 0

          return (
            <details key={log.id} className="group">

              {/* Main row — visible always */}
              <summary className="grid grid-cols-[56px_140px_110px_80px_1fr] gap-x-3 items-center
                                  py-2 px-1 cursor-pointer list-none
                                  hover:bg-gray-50 transition-colors
                                  [&::-webkit-details-marker]:hidden">

                <span className="font-mono text-[11px] text-gray-500">
                  {bogotaHHMM(log.startedAt)}
                </span>

                <span className="text-[12px] text-gray-700 font-medium truncate" title={label}>
                  {label}
                </span>

                <span className={`inline-flex items-center gap-1 text-[12px] ${meta.cls}`}>
                  <span>{meta.icon}</span>
                  <span>{meta.label}</span>
                </span>

                <span className="font-mono text-[11px] text-gray-400">
                  {log.durationMs > 0 ? formatDuration(log.durationMs) : '—'}
                </span>

                <span className="text-[11px] text-gray-500 truncate" title={log.summary}>
                  {log.summary || '—'}
                </span>

              </summary>

              {/* Expanded content — shown by <details> natively */}
              <div className="ml-1 mr-1 mb-2 p-3 bg-gray-50 rounded border-l-2 border-gray-200 text-[12px] space-y-2.5">

                {log.summary && (
                  <div>
                    <span className="text-gray-400 font-semibold mr-2">Summary:</span>
                    <span className="text-gray-700">{log.summary}</span>
                  </div>
                )}

                {log.pipelineId && (
                  <div>
                    <span className="text-gray-400 font-semibold mr-2">Pipeline:</span>
                    <span className="font-mono text-gray-500">{log.pipelineId}</span>
                  </div>
                )}

                {hasNotes && (
                  <div>
                    <span className="text-gray-400 font-semibold mr-2">Notes:</span>
                    <span className="text-gray-600 italic">{log.notes}</span>
                  </div>
                )}

                <div>
                  <span className="text-gray-400 font-semibold mr-2">Warnings:</span>
                  {log.warnings.length === 0 ? (
                    <span className="text-gray-400">0</span>
                  ) : (
                    <ul className="mt-1 ml-4 space-y-0.5">
                      {log.warnings.map((w, i) => (
                        <li key={i} className="text-yellow-700 list-disc">{w}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <span className="text-gray-400 font-semibold mr-2">Errors:</span>
                  {log.errors.length === 0 ? (
                    <span className="text-gray-400">0</span>
                  ) : (
                    <ul className="mt-1 ml-4 space-y-0.5">
                      {log.errors.map((e, i) => (
                        <li key={i} className="text-red-600 list-disc">{e}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {hasActions && (
                  <div>
                    <span className="text-gray-400 font-semibold block mb-1">Actions:</span>
                    <div className="ml-2 grid grid-cols-[120px_1fr] gap-y-0.5">
                      {removed    > 0 && <><span className="text-gray-500">Eliminados:</span>   <span className="text-gray-700">{removed}</span></>}
                      {repaired   > 0 && <><span className="text-gray-500">Reparados:</span>    <span className="text-gray-700">{repaired}</span></>}
                      {suppressed > 0 && <><span className="text-gray-500">Suprimidos:</span>   <span className="text-gray-700">{suppressed}</span></>}
                      {recovered  > 0 && <><span className="text-gray-500">Recuperados:</span>  <span className="text-gray-700">{recovered}</span></>}
                      {flagged    > 0 && <><span className="text-gray-500">Marcados:</span>     <span className="text-gray-700">{flagged}</span></>}
                    </div>
                  </div>
                )}

              </div>

            </details>
          )
        })}
      </div>
    </section>
  )
}
