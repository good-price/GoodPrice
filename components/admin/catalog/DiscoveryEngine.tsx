/**
 * components/admin/catalog/DiscoveryEngine.tsx
 *
 * Catalog Center — Zona 5: DISCOVERY ENGINE
 *
 * Muestra el estado de la última ejecución del Amazon Discovery Engine.
 * Lee el último log de tipo catalog-discovery. Solo lectura.
 *
 * Server Component.
 */

import type { OpsLog } from '@/lib/ops/logs'
import { Card, SectionHeader, relativeTime, fmtDate } from '@/components/admin/shared'

interface Props {
  lastRun: OpsLog | null
}

export function DiscoveryEngine({ lastRun }: Props) {
  if (!lastRun) {
    return (
      <section>
        <SectionHeader>Discovery Engine</SectionHeader>
        <Card>
          <p className="text-sm text-gray-400 text-center py-4">
            Sin ejecuciones registradas.
          </p>
        </Card>
      </section>
    )
  }

  const isSuccess = lastRun.status === 'success'
  const isPartial = lastRun.status === 'partial'
  const isFailed  = lastRun.status === 'failed'

  const statusColor =
    isSuccess ? 'text-green-600' :
    isPartial ? 'text-yellow-600' :
    isFailed  ? 'text-red-500'   : 'text-gray-400'

  const statusLabel =
    isSuccess ? 'Completado' :
    isPartial ? 'Parcial'    :
    isFailed  ? 'Fallido'    : lastRun.status

  // Parse notes into key-value pairs
  const noteMap: Record<string, string> = {}
  for (const part of (lastRun.notes ?? '').split(', ')) {
    const [k, v] = part.split(': ')
    if (k && v !== undefined) noteMap[k.trim()] = v.trim()
  }

  return (
    <section>
      <SectionHeader>Discovery Engine</SectionHeader>

      <Card>
        {/* Status row */}
        <div className="flex items-center justify-between mb-4">
          <span className={`text-sm font-semibold ${statusColor}`}>
            {statusLabel}
          </span>
          {noteMap['category'] && (
            <span className="text-[11px] text-gray-500 font-mono capitalize">
              {noteMap['category']}
            </span>
          )}
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Fuentes',    key: 'sources'   },
            { label: 'Parseados',  key: 'parsed'    },
            { label: 'Validados',  key: 'validated' },
          ].map(({ label, key }) => (
            <div key={key} className="text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
              <p className="text-xl font-bold text-gray-700 tabular-nums mt-0.5">
                {noteMap[key] ?? '—'}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="text-center">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Guardados</p>
            <p className="text-xl font-bold text-green-600 tabular-nums mt-0.5">
              {noteMap['saved'] ?? '—'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Duración</p>
            <p className="text-xl font-bold text-indigo-600 tabular-nums mt-0.5">
              {lastRun.durationMs ? `${(lastRun.durationMs / 1000).toFixed(1)}s` : '—'}
            </p>
          </div>
        </div>

        {/* Timestamp */}
        <div className="text-[11px] text-gray-500 mb-3">
          {relativeTime(lastRun.startedAt)} · {fmtDate(lastRun.startedAt)}
        </div>

        {/* Recovered ASINs (newly added) */}
        {lastRun.actions.recovered.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Nuevos ASINs ({lastRun.actions.recovered.length})
            </p>
            <p className="font-mono text-[10px] text-gray-500 leading-relaxed">
              {lastRun.actions.recovered.slice(0, 10).join(' · ')}
              {lastRun.actions.recovered.length > 10 && ` · +${lastRun.actions.recovered.length - 10} más`}
            </p>
          </div>
        )}

        {/* Warnings */}
        {lastRun.warnings.length > 0 && (
          <div className="mt-3 pt-3 border-t border-yellow-100">
            <p className="text-[10px] text-yellow-600 font-semibold uppercase tracking-wide mb-1">Avisos</p>
            <ul className="space-y-0.5">
              {lastRun.warnings.slice(0, 5).map((w, i) => (
                <li key={i} className="text-[10px] text-yellow-700 font-mono truncate">{w}</li>
              ))}
              {lastRun.warnings.length > 5 && (
                <li className="text-[10px] text-yellow-600">+{lastRun.warnings.length - 5} más</li>
              )}
            </ul>
          </div>
        )}

        {/* Errors */}
        {lastRun.errors.length > 0 && (
          <div className="mt-3 pt-3 border-t border-red-100">
            <p className="text-[10px] text-red-500 font-semibold uppercase tracking-wide mb-1">Errores</p>
            <ul className="space-y-0.5">
              {lastRun.errors.slice(0, 5).map((e, i) => (
                <li key={i} className="text-[10px] text-red-600 font-mono truncate">{e}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Pipeline ID */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Run ID</p>
          <p className="font-mono text-[10px] text-gray-400">{lastRun.id}</p>
        </div>
      </Card>
    </section>
  )
}
