/**
 * components/admin/catalog/CatalogLifecycle.tsx
 *
 * Catalog Center — Zona 9: CATALOG LIFECYCLE
 *
 * Shows aggregate lifecycle health across all catalog products:
 * Healthy / Aging / Stale / Critical / Refresh Needed / Replacement Needed /
 * Average Age / Average Confidence.
 *
 * Server Component. No hooks.
 */

import type { LifecycleGovernance } from '@/lib/catalog/lifecycle/governance'
import { Card, SectionHeader, StatCard } from '@/components/admin/shared'

// ── Sub-components ────────────────────────────────────────────────────────────

function HealthRow({
  label,
  value,
  total,
  color,
}: {
  label: string
  value: number
  total: number
  color: string
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-gray-500 w-32 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`${color} h-2 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-gray-700 w-6 text-right">{value}</span>
      <span className="text-[10px] tabular-nums text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  governance: LifecycleGovernance
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CatalogLifecycle({ governance }: Props) {
  const total = governance.totalProducts

  return (
    <section>
      <SectionHeader>Catalog Lifecycle</SectionHeader>

      {total === 0 ? (
        <Card>
          <p className="text-center text-sm text-gray-400 py-4">
            Sin datos de ciclo de vida. El store se inicializa con el primer pipeline run.
          </p>
        </Card>
      ) : (
        <>
          {/* Summary stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard label="Total"              value={total}                     />
            <StatCard label="Refresh Needed"     value={governance.refreshNeeded}  warn={governance.refreshNeeded > 0}   />
            <StatCard label="Reemplazo Needed"   value={governance.replacementNeeded} warn={governance.replacementNeeded > 0} />
            <StatCard label="Edad Prom."         value={`${governance.averageAgeDays}d`} info />
          </div>

          {/* Health breakdown bars */}
          <Card>
            <div className="space-y-3">
              <HealthRow label="Healthy"  value={governance.healthy}  total={total} color="bg-green-500" />
              <HealthRow label="Aging"    value={governance.aging}    total={total} color="bg-yellow-400" />
              <HealthRow label="Stale"    value={governance.stale}    total={total} color="bg-orange-400" />
              <HealthRow label="Critical" value={governance.critical} total={total} color="bg-red-500" />
            </div>

            <div className="mt-4 pt-3 border-t border-gray-50 flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-gray-400">
              <span>Confianza prom.: <strong className="text-gray-600">{governance.averageConfidence}</strong></span>
              <span>Edad prom.: <strong className="text-gray-600">{governance.averageAgeDays}d</strong></span>
            </div>
          </Card>
        </>
      )}
    </section>
  )
}
