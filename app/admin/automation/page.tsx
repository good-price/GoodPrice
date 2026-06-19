/**
 * app/admin/automation/page.tsx — Automation Center
 *
 * Centro de observación operacional de todas las automatizaciones OPS V3.
 *
 * 5 zonas:
 *   1. Resumen       — conteo dimensional de todas las automatizaciones
 *   2. Automations   — tabla completa con estado de cada automatización
 *   3. Ejecución     — estado del ciclo activo (si aplica)
 *   4. Próximas      — los 3 próximos disparos programados
 *   5. Incidents     — automatizaciones en failed / partial / overdue
 *
 * NO es un panel de configuración. NO es un editor.
 * Es un centro de observación operacional.
 *
 * Server Component. force-dynamic.
 */

import type { Metadata } from 'next'
import Link              from 'next/link'

import {
  getAllAutomations,
  getEnabledAutomations,
  readAutomationState,
  type AutomationDefinition,
} from '@/lib/ops/automation'
import { readMasterCycleState, readSystemHealth } from '@/lib/ops/runtime'
import { getRemainingDuration }                   from '@/lib/ops/time'

import { AutoSummary }         from '@/components/admin/automation/AutoSummary'
import { AutoTable }           from '@/components/admin/automation/AutoTable'
import { AutoActiveExecution } from '@/components/admin/automation/AutoActiveExecution'
import { AutoNextExecutions }  from '@/components/admin/automation/AutoNextExecutions'
import { AutoIncidents }       from '@/components/admin/automation/AutoIncidents'
import type { AutoTableRow, AutoRowStatus }  from '@/components/admin/automation/AutoTable'
import type { UpcomingExecution }            from '@/components/admin/automation/AutoNextExecutions'
import type { AutoIncident }                 from '@/components/admin/automation/AutoIncidents'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Automation Center — GOODPRICE Internal' }

const AUTOMATION_LABELS: Record<string, string> = {
  'cycle-3am':      'Ciclo 3AM',
  'trust-recompute': 'Trust Recompute',
  'live-truth':     'Live Truth',
  'link-audit':     'Link Audit',
  'colombia-audit': 'Colombia Audit',
  'repair':         'Repair',
  'trm-update':     'TRM Update',
}

export default function AutomationCenterPage() {
  // ── Lecturas del backend OPS V3 ──────────────────────────────────────────────
  const allAutomations     = getAllAutomations()       // AutomationDefinition[] — 7
  const enabledAutomations = getEnabledAutomations()   // AutomationDefinition[]
  const autoState          = readAutomationState()     // AutomationStateFile
  const cycleState         = readMasterCycleState()    // MasterCycleState
  readSystemHealth()                                   // warm call — not used directly

  // ── Valores derivados ────────────────────────────────────────────────────────

  // Zona 1 — Resumen
  const total    = allAutomations.length
  const enabled  = enabledAutomations.length
  const disabled = total - enabled
  const overdue  = Object.values(autoState.automations)
    .filter(s => s?.nextRunAt && getRemainingDuration(s.nextRunAt).isPast)
    .length
  const running  = cycleState.isRunning ? 1 : 0

  // Zona 2 — Table rows
  const tableRows: AutoTableRow[] = allAutomations.map((def: AutomationDefinition) => {
    const state              = autoState.automations[def.id]
    const isCurrentlyRunning = cycleState.isRunning && cycleState.currentStage === def.jobType
    const isOverdue          = !isCurrentlyRunning
      && (state?.nextRunAt ? getRemainingDuration(state.nextRunAt).isPast : false)

    let status: AutoRowStatus
    if (isCurrentlyRunning)       status = 'running'
    else if (isOverdue)           status = 'overdue'
    else if (!state || state.totalRuns === 0) status = 'never-run'
    else                          status = (state.lastStatus ?? 'never-run') as AutoRowStatus

    return {
      id:                def.id,
      label:             AUTOMATION_LABELS[def.id] ?? def.id,
      status,
      lastRunAt:         state?.lastRunAt         ?? null,
      nextRunAt:         state?.nextRunAt          ?? null,
      averageDurationMs: state?.averageDurationMs  ?? 0,
      totalRuns:         state?.totalRuns          ?? 0,
    }
  })

  // Zona 3 — Active execution elapsed time
  const elapsedMs = cycleState.isRunning && cycleState.startedAt
    ? Date.now() - new Date(cycleState.startedAt).getTime()
    : 0

  // Zona 4 — Próximas 3 ejecuciones
  const upcoming: UpcomingExecution[] = allAutomations
    .flatMap((def: AutomationDefinition) => {
      const state = autoState.automations[def.id]
      if (!state?.nextRunAt) return []
      const remaining = getRemainingDuration(state.nextRunAt)
      if (remaining.isPast) return []
      return [{
        id:          def.id,
        label:       AUTOMATION_LABELS[def.id] ?? def.id,
        nextRunAt:   state.nextRunAt,
        remainingMs: remaining.totalMs,
      }]
    })
    .sort((a, b) => a.remainingMs - b.remainingMs)
    .slice(0, 3)

  // Zona 5 — Incidents (failed / partial / overdue)
  const incidents: AutoIncident[] = allAutomations.flatMap((def: AutomationDefinition) => {
    const state = autoState.automations[def.id]
    if (!state) return []

    const isOverdue  = state.nextRunAt ? getRemainingDuration(state.nextRunAt).isPast : false
    const isFailed   = state.lastStatus === 'failed'
    const isPartial  = state.lastStatus === 'partial'

    if (!isOverdue && !isFailed && !isPartial) return []

    return [{
      id:        def.id,
      label:     AUTOMATION_LABELS[def.id] ?? def.id,
      type:      (isOverdue ? 'overdue' : isFailed ? 'failed' : 'partial') as AutoIncident['type'],
      lastRunAt: state.lastRunAt,
      overdueMs: isOverdue && state.nextRunAt
        ? Math.abs(getRemainingDuration(state.nextRunAt).totalMs)
        : null,
    }]
  })

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-gray-200">
        <div>
          <h1 className="text-base font-bold text-gray-900">
            <span className="text-[#F7A823]">GOOD</span>PRICE
            <span className="text-gray-300 font-light mx-2">/</span>
            <span className="text-gray-500 font-normal">Automation Center</span>
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5">Centro de observación operacional</p>
        </div>
        <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-400 border border-gray-200">
          🔒 INTERNAL
        </span>
      </div>

      {/* Zonas */}
      <div className="divide-y divide-gray-100">

        <div className="py-6">
          <AutoSummary
            total={total}
            enabled={enabled}
            disabled={disabled}
            overdue={overdue}
            running={running}
          />
        </div>

        <div className="py-6">
          <AutoTable rows={tableRows} />
        </div>

        <div className="py-6">
          <AutoActiveExecution cycleState={cycleState} elapsedMs={elapsedMs} />
        </div>

        <div className="py-6">
          <AutoNextExecutions upcoming={upcoming} />
        </div>

        <div className="py-6">
          <AutoIncidents incidents={incidents} />
        </div>

      </div>

      {/* Navegación contextual */}
      <div className="pt-6 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1">
        <Link href="/admin"         className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">Nerve Center →</Link>
        <Link href="/admin/activity" className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">Activity Center →</Link>
        <Link href="/admin/system"   className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">System Center →</Link>
        <Link href="/admin/analytics" className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">Analytics →</Link>
      </div>

    </div>
  )
}
