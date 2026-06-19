/**
 * components/admin/automation/AutoIncidents.tsx
 *
 * Automation Center — Zona 5: INCIDENTS
 *
 * Lista automatizaciones en estado failed, partial o overdue.
 * Si no hay ninguna: "Sistema operacional estable".
 *
 * Server Component.
 */

export type IncidentType = 'failed' | 'partial' | 'overdue'

export interface AutoIncident {
  id:        string
  label:     string
  type:      IncidentType
  lastRunAt: string | null
  overdueMs: number | null
}

interface Props {
  incidents: AutoIncident[]
}

const INCIDENT_META: Record<IncidentType, { label: string; cls: string; prefix: string }> = {
  failed:  { label: 'Failed',  cls: 'text-red-500',    prefix: '✗' },
  partial: { label: 'Partial', cls: 'text-yellow-600', prefix: '~' },
  overdue: { label: 'Overdue', cls: 'text-red-500',    prefix: '⚠' },
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)     return 'hace un momento'
  if (ms < 3_600_000)  return `hace ${Math.floor(ms / 60_000)}m`
  if (ms < 86_400_000) return `hace ${Math.floor(ms / 3_600_000)}h`
  return `hace ${Math.floor(ms / 86_400_000)}d`
}

function formatOverdue(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000)
  const days    = Math.floor(total / 86400)
  const hours   = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0)    return `hace ${days}d ${hours}h`
  if (hours > 0)   return `hace ${hours}h ${minutes}m`
  if (minutes > 0) return `hace ${minutes}m`
  return 'hace un momento'
}

export function AutoIncidents({ incidents }: Props) {
  if (incidents.length === 0) {
    return (
      <section>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
          Incidents
        </p>
        <p className="text-sm text-green-600 font-medium">Sistema operacional estable</p>
      </section>
    )
  }

  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Incidents
      </p>

      <div className="space-y-3">
        {incidents.map(incident => {
          const meta = INCIDENT_META[incident.type]
          const when = incident.type === 'overdue' && incident.overdueMs !== null
            ? formatOverdue(incident.overdueMs)
            : relativeTime(incident.lastRunAt)

          return (
            <div key={incident.id} className="flex items-start gap-3">
              <span className={`mt-0.5 font-bold text-[13px] ${meta.cls}`}>
                {meta.prefix}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-800">{incident.label}</p>
                <p className={`text-[11px] ${meta.cls}`}>
                  {meta.label} {when}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
