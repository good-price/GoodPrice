/**
 * components/admin/activity/ActivityIncidents.tsx
 *
 * Activity Center — Zona 3: INCIDENTES
 *
 * Muestra únicamente eventos failed / partial / cancelled de los últimos logs.
 * Si no hay ninguno: "Sistema operacional estable".
 *
 * Server Component.
 */

import type { OpsLog } from '@/lib/ops/logs'

interface Props {
  incidents: OpsLog[]
}

const STATUS_META: Record<string, { icon: string; label: string; cls: string }> = {
  failed:    { icon: '✗', label: 'Failed',    cls: 'text-red-500' },
  partial:   { icon: '~', label: 'Partial',   cls: 'text-yellow-600' },
  cancelled: { icon: '—', label: 'Cancelled', cls: 'text-gray-500' },
}

const JOB_LABELS: Record<string, string> = {
  'cycle-3am':         'Ciclo 3AM',
  'trust-recompute':   'Trust Recompute',
  'self-healing':      'Self Healing',
  'live-truth':        'Live Truth',
  'link-audit':        'Link Audit',
  'colombia-audit':    'Colombia Audit',
  'repair':            'Repair',
  'paapi-sync':        'PAAPI Sync',
  'trm-update':        'TRM Update',
  'recovery-pipeline': 'Recovery',
  'manual-action':     'Manual',
}

function bogotaHHMM(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
    timeZone: 'America/Bogota',
  }).format(new Date(iso))
}

export function ActivityIncidents({ incidents }: Props) {
  if (incidents.length === 0) {
    return (
      <section>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
          Incidentes
        </p>
        <p className="text-sm text-green-600 font-medium">Sistema operacional estable</p>
      </section>
    )
  }

  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Incidentes
      </p>

      {/* Column headers */}
      <div className="grid grid-cols-[56px_140px_110px_60px_1fr] gap-x-3 px-1 pb-2 border-b border-gray-100">
        {(['Hora', 'Tipo', 'Estado', 'Errores', 'Pipeline'] as const).map(h => (
          <span key={h} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            {h}
          </span>
        ))}
      </div>

      <div className="divide-y divide-gray-50">
        {incidents.map(log => {
          const meta  = STATUS_META[log.status] ?? STATUS_META['failed']!
          const label = JOB_LABELS[log.jobType] ?? log.jobType

          return (
            <div
              key={log.id}
              className="grid grid-cols-[56px_140px_110px_60px_1fr] gap-x-3 items-start py-2.5 px-1"
            >
              <span className="font-mono text-[11px] text-gray-500">
                {bogotaHHMM(log.startedAt)}
              </span>

              <div>
                <span className="text-[12px] text-gray-700 font-medium">{label}</span>
                {log.summary && (
                  <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{log.summary}</p>
                )}
              </div>

              <span className={`inline-flex items-center gap-1 text-[12px] ${meta.cls}`}>
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
              </span>

              <span className="text-[12px] text-gray-500 tabular-nums">
                {log.errors.length > 0 ? log.errors.length : '—'}
              </span>

              <span className="font-mono text-[10px] text-gray-400 truncate" title={log.pipelineId}>
                {log.pipelineId ?? '—'}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
