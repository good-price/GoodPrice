/**
 * app/admin/page.tsx — Nerve Center
 *
 * Centro de control operativo de GOODPRICE OPS V3.
 *
 * Responde a tres preguntas en menos de 5 segundos:
 *   1. Qué está pasando  (Zona 1 — Sistema, Zona 2 — Ciclo Maestro)
 *   2. Qué pasó          (Zona 4 — Última Actividad)
 *   3. Qué pasará        (Zona 3 — Próximo Ciclo)
 *
 * Todas las lecturas son sincrónicas desde el backend OPS V3.
 * Ninguna lógica de negocio en este archivo — solo composición.
 *
 * Server Component.
 */

import type { Metadata } from 'next'
import { readMasterCycleState, readSystemHealth } from '@/lib/ops/runtime'
import { readMaintenanceState }                   from '@/lib/ops/maintenance'
import { readAutomationState }                    from '@/lib/ops/automation'
import { readSiteMode }                           from '@/lib/system/site-mode'
import { getRemainingDuration }                   from '@/lib/ops/time'
import { readLatestLogs }                         from '@/lib/ops/logs'
import { ZoneSystem }                             from '@/components/admin/nerve/ZoneSystem'
import { ZoneCycle }                              from '@/components/admin/nerve/ZoneCycle'
import { ZoneNextCycle }                          from '@/components/admin/nerve/ZoneNextCycle'
import { ZoneActivity }                           from '@/components/admin/nerve/ZoneActivity'
import { ZoneAutomationStatus }                   from '@/components/admin/nerve/ZoneAutomationStatus'
import { ZoneOverdue }                            from '@/components/admin/nerve/ZoneOverdue'
import { MaintenanceBanner }                      from '@/components/admin/nerve/MaintenanceBanner'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Nerve Center — GOODPRICE Internal' }

const AUTOMATION_LABELS: Record<string, string> = {
  'cycle-3am':  'Ciclo 3AM',
  'trm-update': 'TRM Update',
  'paapi-sync': 'PAAPI Sync',
  'live-truth': 'Live Truth',
  'repair':     'Repair',
}

export default function NerveCenterPage() {
  // ── Lecturas del backend OPS V3 (síncronas, fault-tolerant) ─────────────────
  const cycleState      = readMasterCycleState()
  const systemHealth    = readSystemHealth()
  const maintenanceData = readMaintenanceState()
  const siteMode        = readSiteMode()
  const autoState       = readAutomationState()
  const recentLogs      = readLatestLogs(5)

  // ── Valores derivados (computados al momento del render) ─────────────────────

  // Sesión de mantenimiento activa (null si no hay ninguna)
  const activeSession = maintenanceData.current?.status === 'running'
    ? maintenanceData.current
    : null

  // Countdown al próximo ciclo 3AM (null si el ciclo está corriendo o no hay nextRunAt)
  const cycle3am  = autoState.automations['cycle-3am']
  const nextRunAt = cycle3am?.nextRunAt ?? null
  const remaining = nextRunAt && !cycleState.isRunning
    ? getRemainingDuration(nextRunAt)
    : null

  // Tiempo transcurrido del ciclo activo (0 si no está corriendo)
  const elapsedMs = cycleState.isRunning && cycleState.startedAt
    ? Date.now() - new Date(cycleState.startedAt).getTime()
    : 0

  // Último ciclo exitoso (solo conocido si el último estado fue success)
  const lastSuccessfulAt = cycleState.lastStatus === 'success'
    ? cycleState.lastCompletedAt
    : null

  // Timestamp más reciente entre las fuentes de estado — indica cuán "fresco" es el sistema
  const timestamps = [
    systemHealth.lastUpdatedAt,
    cycleState.lastCompletedAt,
    autoState.updatedAt,
  ].filter((t): t is string => t !== null && t !== undefined)
  const syncedAt = timestamps.length > 0
    ? timestamps.reduce((latest, t) => (t > latest ? t : latest))
    : null

  // Automatizaciones con nextRunAt ya vencido
  const overdueItems = Object.entries(autoState.automations)
    .filter(([, state]) => state?.nextRunAt && getRemainingDuration(state.nextRunAt).isPast)
    .map(([id, state]) => ({
      id,
      label:     AUTOMATION_LABELS[id] ?? id,
      overdueMs: Math.abs(getRemainingDuration(state!.nextRunAt!).totalMs),
    }))

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-gray-200">
        <div>
          <h1 className="text-base font-bold text-gray-900">
            <span className="text-[#F7A823]">GOOD</span>PRICE
            <span className="text-gray-300 font-light mx-2">/</span>
            <span className="text-gray-500 font-normal">Nerve Center</span>
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5">Centro de control operativo</p>
        </div>
        <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-400 border border-gray-200">
          🔒 INTERNAL
        </span>
      </div>

      {/* Banner de mantenimiento programado (condicional) */}
      <div className="pt-6">
        <MaintenanceBanner siteMode={siteMode} />
      </div>

      {/* Zonas */}
      <div className="divide-y divide-gray-100">

        <div className="py-6">
          <ZoneSystem
            health={systemHealth}
            maintenance={activeSession}
            siteMode={siteMode}
            lastSuccessfulAt={lastSuccessfulAt}
            syncedAt={syncedAt}
          />
        </div>

        <div className="py-6">
          <ZoneOverdue overdueItems={overdueItems} />
        </div>

        <div className="py-6">
          <ZoneCycle
            state={cycleState}
            elapsedMs={elapsedMs}
          />
        </div>

        <div className="py-6">
          <ZoneNextCycle
            nextRunAt={nextRunAt}
            remaining={remaining}
            isRunning={cycleState.isRunning}
          />
        </div>

        <div className="py-6">
          <ZoneAutomationStatus autoState={autoState} />
        </div>

        <div className="py-6">
          <ZoneActivity
            logs={recentLogs}
          />
        </div>

      </div>

    </div>
  )
}
