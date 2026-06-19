/**
 * components/admin/catalog/CatalogHistory.tsx
 *
 * Catalog Center — Zona 4: HISTORY
 *
 * Muestra los últimos eventos de catalog-fill y manual-action.
 * Filtra de los 50 logs más recientes del sistema OPS V3.
 * Si no hay eventos: muestra "Sin eventos."
 *
 * Columnas: Fecha · Tipo · Estado · Resumen · Notas
 * Sin expanders. Sin Client Components.
 *
 * Server Component.
 */

import type { OpsLog } from '@/lib/ops/logs'
import { SectionHeader, Th, Td } from '@/components/admin/shared'

interface Props {
  logs: OpsLog[]
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  success:   { label: 'OK',         cls: 'bg-green-100 text-green-700' },
  partial:   { label: 'Parcial',    cls: 'bg-yellow-100 text-yellow-700' },
  failed:    { label: 'Fallido',    cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelado',  cls: 'bg-gray-100 text-gray-500' },
}

const JOB_LABELS: Record<string, string> = {
  'catalog-fill':  'Catalog Fill',
  'manual-action': 'Manual',
}

function bogotaDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day:      '2-digit',
    month:    '2-digit',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
    timeZone: 'America/Bogota',
  }).format(new Date(iso))
}

export function CatalogHistory({ logs }: Props) {
  return (
    <section>
      <SectionHeader>Historial</SectionHeader>

      {logs.length === 0 ? (
        <p className="text-sm text-gray-400">Sin eventos.</p>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th>Estado</Th>
                <Th>Resumen</Th>
                <Th>Notas</Th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const status = STATUS_META[log.status] ?? STATUS_META['cancelled']!
                const label  = JOB_LABELS[log.jobType] ?? log.jobType

                return (
                  <tr key={log.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                    <Td mono muted>
                      {bogotaDateTime(log.startedAt)}
                    </Td>
                    <Td>
                      <span className="font-medium text-[12px]">{label}</span>
                    </Td>
                    <Td>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${status.cls}`}>
                        {status.label}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[12px]">{log.summary || '—'}</span>
                    </Td>
                    <Td muted>
                      {log.notes.trim().length > 0
                        ? <span className="text-[11px] italic">{log.notes}</span>
                        : <span className="text-[10px] text-gray-300">—</span>
                      }
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
