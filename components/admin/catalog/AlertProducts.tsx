/**
 * components/admin/catalog/AlertProducts.tsx
 *
 * Zone 16 — Last 20 active alerts, newest first.
 * Server Component.
 */

import type { ProductAlert, AlertSeverity, AlertType } from '@/lib/catalog/alerts/types'

interface Props {
  alerts: ProductAlert[]
}

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  high:   'bg-red-800 text-red-200',
  medium: 'bg-yellow-800 text-yellow-200',
  low:    'bg-gray-700 text-gray-300',
}

const TYPE_LABEL: Record<AlertType, string> = {
  'price-drop':         'Precio baja',
  'high-opportunity':   'Alta oportunidad',
  'critical-lifecycle': 'Ciclo crítico',
  'low-confidence':     'Baja confianza',
  'replacement-needed': 'Reemplazar',
}

export function AlertProducts({ alerts }: Props) {
  // Only unresolved alerts, newest first, top 20
  const active = [...alerts]
    .filter(a => a.resolvedAt === null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)

  if (active.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-white">
          Zona 16 — Alertas Activas
        </h2>
        <p className="text-gray-400 text-sm">Sin alertas activas en este momento.</p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-white">
        Zona 16 — Alertas Activas
        <span className="text-sm font-normal text-gray-400 ml-2">
          ({active.length} sin resolver, más recientes primero)
        </span>
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase border-b border-gray-700">
            <tr>
              <th className="pb-2 pr-4">ASIN</th>
              <th className="pb-2 pr-4">Categoría</th>
              <th className="pb-2 pr-4">Tipo</th>
              <th className="pb-2 pr-4">Severidad</th>
              <th className="pb-2 pr-4">Mensaje</th>
              <th className="pb-2">Creada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {active.map(a => (
              <tr key={a.id} className="hover:bg-gray-800 transition-colors">
                <td className="py-2 pr-4 font-mono text-gray-200">{a.asin}</td>
                <td className="py-2 pr-4 text-gray-400 text-xs">{a.category}</td>
                <td className="py-2 pr-4 text-xs text-gray-300">{TYPE_LABEL[a.type]}</td>
                <td className="py-2 pr-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${SEVERITY_BADGE[a.severity]}`}>
                    {a.severity.toUpperCase()}
                  </span>
                </td>
                <td className="py-2 pr-4 text-xs text-gray-400 max-w-xs truncate" title={a.message}>
                  {a.message}
                </td>
                <td className="py-2 text-xs text-gray-500">
                  {new Date(a.createdAt).toLocaleDateString('es-CO', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
