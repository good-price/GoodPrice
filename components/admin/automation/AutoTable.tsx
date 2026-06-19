/**
 * components/admin/automation/AutoTable.tsx
 *
 * Automation Center — Zona 2: AUTOMATIONS TABLE
 *
 * Tabla completa con todas las automatizaciones registradas.
 * Por fila: nombre · estado · última ejecución · próxima · duración promedio.
 *
 * Server Component.
 */

import { formatDuration } from '@/lib/ops/time'

export type AutoRowStatus =
  | 'success'
  | 'failed'
  | 'partial'
  | 'never-run'
  | 'running'
  | 'overdue'

export interface AutoTableRow {
  id:                string
  label:             string
  status:            AutoRowStatus
  lastRunAt:         string | null
  nextRunAt:         string | null
  averageDurationMs: number
  totalRuns:         number
}

interface Props {
  rows: AutoTableRow[]
}

const STATUS_META: Record<AutoRowStatus, { icon: string; label: string; cls: string }> = {
  success:   { icon: '✓',  label: 'Success',   cls: 'text-green-600' },
  failed:    { icon: '⚠',  label: 'Failed',    cls: 'text-red-500' },
  partial:   { icon: '~',  label: 'Partial',   cls: 'text-yellow-600' },
  'never-run': { icon: '●', label: 'Never Run', cls: 'text-gray-400' },
  running:   { icon: '⏳', label: 'Running',   cls: 'text-yellow-600 font-semibold' },
  overdue:   { icon: '⚠',  label: 'Overdue',   cls: 'text-red-500 font-semibold' },
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)     return 'ahora mismo'
  if (ms < 3_600_000)  return `hace ${Math.floor(ms / 60_000)}m`
  if (ms < 86_400_000) return `hace ${Math.floor(ms / 3_600_000)}h`
  return `hace ${Math.floor(ms / 86_400_000)}d`
}

function bogotaTime(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-CO', {
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
    timeZone: 'America/Bogota',
  }).format(new Date(iso))
}

export function AutoTable({ rows }: Props) {
  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Automations
      </p>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide pb-2 pr-4">
                Automatización
              </th>
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide pb-2 pr-4">
                Estado
              </th>
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide pb-2 pr-4">
                Última ejecución
              </th>
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide pb-2 pr-4">
                Próxima
              </th>
              <th className="text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide pb-2">
                Duración prom.
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(row => {
              const meta = STATUS_META[row.status]
              return (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-gray-800">{row.label}</span>
                    {row.totalRuns > 0 && (
                      <span className="ml-2 text-[10px] text-gray-300">{row.totalRuns}x</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className={`inline-flex items-center gap-1.5 text-[12px] ${meta.cls}`}>
                      <span>{meta.icon}</span>
                      <span>{meta.label}</span>
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-gray-500 text-[12px]">
                    {relativeTime(row.lastRunAt)}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[12px] text-gray-500">
                    {bogotaTime(row.nextRunAt)}
                    {row.nextRunAt && (
                      <span className="text-gray-300 ml-1">BOG</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right font-mono text-[12px] text-gray-400">
                    {row.averageDurationMs > 0 ? formatDuration(row.averageDurationMs) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
