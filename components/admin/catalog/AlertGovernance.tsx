/**
 * components/admin/catalog/AlertGovernance.tsx
 *
 * Zone 15 — Alert Intelligence governance summary.
 * Server Component.
 */

import type { AlertGovernance as AlertGovernanceType } from '@/lib/catalog/alerts/types'

interface Props {
  governance: AlertGovernanceType
}

export function AlertGovernance({ governance }: Props) {
  const { totalAlerts, low, medium, high, unresolved } = governance

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-white">
        Zona 15 — Alert Intelligence
      </h2>

      {totalAlerts === 0 ? (
        <p className="text-gray-400 text-sm">
          Sin alertas aún. Se generan automáticamente tras cada scan de lifecycle o pricing.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total alertas"   value={totalAlerts} color="text-white" />
            <StatCard label="Sin resolver"    value={unresolved}  color={unresolved > 0 ? 'text-yellow-400' : 'text-green-400'} />
            <StatCard label="Alta severidad"  value={high}        color={high > 0 ? 'text-red-400' : 'text-gray-400'} />
            <StatCard label="Resueltas"       value={totalAlerts - unresolved} color="text-green-400" />
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Distribución por severidad</h3>
            <div className="space-y-2">
              <SeverityBar label="Alta"   count={high}   total={totalAlerts} color="bg-red-500" />
              <SeverityBar label="Media"  count={medium} total={totalAlerts} color="bg-yellow-500" />
              <SeverityBar label="Baja"   count={low}    total={totalAlerts} color="bg-gray-500" />
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  )
}

function SeverityBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span>{count} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
