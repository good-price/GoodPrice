/**
 * components/admin/nerve/ZoneActivity.tsx
 *
 * Nerve Center — Zona 4: ÚLTIMA ACTIVIDAD
 *
 * Muestra los últimos 5 eventos del log operacional (OpsLog).
 * Fuente: readLatestLogs(5) — lectura sincrónica de archivos de día.
 *
 * Server Component. Sin lógica de negocio.
 */

import Link from 'next/link'
import type { OpsLog } from '@/lib/ops/logs'

interface Props {
  logs: OpsLog[]
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  success:   { label: 'SUCCESS',   cls: 'text-green-600' },
  partial:   { label: 'PARTIAL',   cls: 'text-yellow-600' },
  failed:    { label: 'FAILED',    cls: 'text-red-500' },
  cancelled: { label: 'CANCEL',    cls: 'text-gray-400' },
}

function bogotaDateTime(iso: string): string {
  const date = new Date(iso)
  const now  = new Date()
  const diff = now.getTime() - date.getTime()

  const time = new Intl.DateTimeFormat('es-CO', {
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
    timeZone: 'America/Bogota',
  }).format(date)

  if (diff < 86_400_000)  return time
  if (diff < 172_800_000) return `Ayer ${time}`

  const day = new Intl.DateTimeFormat('es-CO', {
    day:      '2-digit',
    month:    '2-digit',
    timeZone: 'America/Bogota',
  }).format(date)

  return `${day} ${time}`
}

function formatMs(ms: number): string {
  if (ms <= 0) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return rs > 0 ? `${m}m ${rs}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

export function ZoneActivity({ logs }: Props) {
  return (
    <section className="border-t border-gray-100 pt-6">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Última Actividad
      </p>

      {logs.length === 0 ? (
        <p className="text-sm text-gray-400">Sin actividad reciente</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide pb-2 pr-4 w-[120px]">
                  Hora
                </th>
                <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide pb-2 pr-4">
                  Tipo
                </th>
                <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide pb-2 pr-4 w-[80px]">
                  Estado
                </th>
                <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide pb-2 w-[80px]">
                  Duración
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const meta = STATUS_META[log.status]
                  ?? { label: log.status.toUpperCase(), cls: 'text-gray-400' }
                return (
                  <tr
                    key={log.id}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="py-2 pr-4 font-mono text-[11px] text-gray-500">
                      {bogotaDateTime(log.startedAt)}
                    </td>
                    <td className="py-2 pr-4 font-mono text-[11px] text-gray-800">
                      {log.jobType}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`text-[11px] font-semibold ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-2 font-mono text-[11px] text-gray-500">
                      {formatMs(log.durationMs)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between">
        <Link
          href="/admin/analytics"
          className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
        >
          Analytics →
        </Link>
        <Link
          href="/admin/activity"
          className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
        >
          Activity Center →
        </Link>
      </div>
    </section>
  )
}
