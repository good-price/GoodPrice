/**
 * app/admin/activity/page.tsx — Activity Center
 *
 * Centro de historial operacional de GOODPRICE OPS V3.
 *
 * 5 zonas:
 *   1. Resumen         — totales acumulados (readLogsSummary)
 *   2. Actividad       — últimos 20 eventos expandibles (readLatestLogs)
 *   3. Incidentes      — failed / partial / cancelled de los últimos 50 eventos
 *   4. Acciones        — removed/repaired/suppressed/recovered/flagged agregados
 *   5. Último Ciclo    — estado del ciclo maestro + sesión de mantenimiento
 *
 * Server Component. force-dynamic.
 */

import type { Metadata } from 'next'
import Link              from 'next/link'

import {
  readLatestLogs,
  readLogsSummary,
} from '@/lib/ops/logs'
import { readMasterCycleState }  from '@/lib/ops/runtime'
import { readMaintenanceState }  from '@/lib/ops/maintenance'

import { ActivitySummary }    from '@/components/admin/activity/ActivitySummary'
import { ActivityLog }        from '@/components/admin/activity/ActivityLog'
import { ActivityIncidents }  from '@/components/admin/activity/ActivityIncidents'
import { ActivityActions }    from '@/components/admin/activity/ActivityActions'
import { ActivityLastCycle }  from '@/components/admin/activity/ActivityLastCycle'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Activity Center — GOODPRICE Internal' }

export default function ActivityCenterPage() {
  // ── Lecturas del backend OPS V3 ──────────────────────────────────────────────
  const summary    = readLogsSummary()          // OpsLogIndex — resumen por día
  const allLogs    = readLatestLogs(50)          // últimos 50 eventos
  const cycleState = readMasterCycleState()     // MasterCycleState
  const maintData  = readMaintenanceState()     // MaintenanceStateFile

  // ── Zona 1 — Resumen: agregar totales del índice histórico ──────────────────
  const totals = summary.reduce(
    (acc, entry) => ({
      total:     acc.total     + entry.totalRuns,
      success:   acc.success   + entry.successfulRuns,
      partial:   acc.partial   + entry.partialRuns,
      failed:    acc.failed    + entry.failedRuns,
      cancelled: acc.cancelled + entry.cancelledRuns,
    }),
    { total: 0, success: 0, partial: 0, failed: 0, cancelled: 0 },
  )

  // ── Zona 2 — Actividad Reciente: primeros 20 del batch ──────────────────────
  const recentLogs = allLogs.slice(0, 20)

  // ── Zona 3 — Incidentes: failed / partial / cancelled del batch completo ────
  const incidents = allLogs.filter(l =>
    l.status === 'failed' || l.status === 'partial' || l.status === 'cancelled',
  )

  // ── Zona 4 — Acciones: suma de arrays en actions de todos los logs ───────────
  const actionTotals = allLogs.reduce(
    (acc, log) => ({
      removed:    acc.removed    + log.actions.removed.length,
      repaired:   acc.repaired   + log.actions.repaired.length,
      suppressed: acc.suppressed + log.actions.suppressed.length,
      recovered:  acc.recovered  + log.actions.recovered.length,
      flagged:    acc.flagged    + log.actions.flagged.length,
    }),
    { removed: 0, repaired: 0, suppressed: 0, recovered: 0, flagged: 0 },
  )

  // ── Zona 5 — Mantenimiento: activo > último ──────────────────────────────────
  const activeMaint = maintData.current?.status === 'running'
    ? maintData.current
    : null
  const lastMaint = maintData.lastSession

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-gray-200">
        <div>
          <h1 className="text-base font-bold text-gray-900">
            <span className="text-[#F7A823]">GOOD</span>PRICE
            <span className="text-gray-300 font-light mx-2">/</span>
            <span className="text-gray-500 font-normal">Activity Center</span>
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5">Historial operacional</p>
        </div>
        <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-400 border border-gray-200">
          🔒 INTERNAL
        </span>
      </div>

      {/* Zonas */}
      <div className="divide-y divide-gray-100">

        <div className="py-6">
          <ActivitySummary
            total={totals.total}
            success={totals.success}
            partial={totals.partial}
            failed={totals.failed}
            cancelled={totals.cancelled}
          />
        </div>

        <div className="py-6">
          <ActivityLog logs={recentLogs} />
        </div>

        <div className="py-6">
          <ActivityIncidents incidents={incidents} />
        </div>

        <div className="py-6">
          <ActivityActions
            removed={actionTotals.removed}
            repaired={actionTotals.repaired}
            suppressed={actionTotals.suppressed}
            recovered={actionTotals.recovered}
            flagged={actionTotals.flagged}
          />
        </div>

        <div className="py-6">
          <ActivityLastCycle
            cycleState={cycleState}
            activeSession={activeMaint}
            lastSession={lastMaint}
          />
        </div>

      </div>

      {/* Links contextuales */}
      <div className="pt-6 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1">
        <Link href="/admin"            className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">Nerve Center →</Link>
        <Link href="/admin/automation" className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">Automation Center →</Link>
        <Link href="/admin/system"     className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">System Center →</Link>
        <Link href="/admin/analytics"  className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">Analytics →</Link>
      </div>

    </div>
  )
}
