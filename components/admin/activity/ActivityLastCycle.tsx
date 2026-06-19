/**
 * components/admin/activity/ActivityLastCycle.tsx
 *
 * Activity Center — Zona 5: ÚLTIMO CICLO + MANTENIMIENTO
 *
 * Muestra el último ciclo maestro desde readMasterCycleState().
 * Integra debajo un bloque de mantenimiento si existe sesión actual o última.
 *
 * Server Component.
 */

import type { MasterCycleState }    from '@/lib/ops/runtime'
import type { MaintenanceSession }   from '@/lib/ops/maintenance'
import { formatDuration }            from '@/lib/ops/time'

interface Props {
  cycleState:        MasterCycleState
  activeSession:     MaintenanceSession | null
  lastSession:       MaintenanceSession | null
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  success:   { label: 'SUCCESS',   cls: 'text-green-600' },
  partial:   { label: 'PARTIAL',   cls: 'text-yellow-600' },
  failed:    { label: 'FAILED',    cls: 'text-red-500' },
  cancelled: { label: 'CANCELLED', cls: 'text-gray-400' },
}

const MAINT_STATUS_META: Record<string, { label: string; cls: string }> = {
  running:   { label: 'Activa',    cls: 'text-yellow-600' },
  completed: { label: 'Completada', cls: 'text-green-600' },
  failed:    { label: 'Fallida',    cls: 'text-red-500' },
}

function bogotaDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    month:    '2-digit',
    day:      '2-digit',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
    timeZone: 'America/Bogota',
  }).format(new Date(iso))
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)     return 'ahora mismo'
  if (ms < 3_600_000)  return `hace ${Math.floor(ms / 60_000)}m`
  if (ms < 86_400_000) return `hace ${Math.floor(ms / 3_600_000)}h`
  return `hace ${Math.floor(ms / 86_400_000)}d`
}

export function ActivityLastCycle({ cycleState, activeSession, lastSession }: Props) {
  const noCycleEver = cycleState.totalRuns === 0 && !cycleState.lastCompletedAt

  // Show current running cycle if active, else show last completed
  const displayStatus = cycleState.isRunning
    ? null   // still running — no "last" to show yet
    : cycleState.lastStatus

  const statusMeta = displayStatus ? (STATUS_META[displayStatus] ?? null) : null

  // Maintenance to display: active > last session
  const maintDisplay: MaintenanceSession | null = activeSession ?? lastSession

  return (
    <section>

      {/* ── Último Ciclo ─────────────────────────────────────────────────── */}
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Último Ciclo
      </p>

      {noCycleEver ? (
        <p className="text-sm text-gray-400 mb-6">Sin ciclos registrados</p>
      ) : (
        <div className="grid grid-cols-[160px_1fr] gap-y-3 text-sm mb-6">

          {statusMeta && (
            <>
              <span className="text-gray-400">Estado</span>
              <span className={`font-bold text-[12px] ${statusMeta.cls}`}>
                {statusMeta.label}
              </span>
            </>
          )}

          {cycleState.isRunning && (
            <>
              <span className="text-gray-400">Estado</span>
              <span className="font-semibold text-yellow-600">● Ejecutando</span>
            </>
          )}

          {cycleState.lastDurationMs > 0 && (
            <>
              <span className="text-gray-400">Duración</span>
              <span className="font-mono text-gray-700">{formatDuration(cycleState.lastDurationMs)}</span>
            </>
          )}

          {cycleState.lastStartedAt && (
            <>
              <span className="text-gray-400">Inicio</span>
              <span className="text-gray-500">
                {bogotaDateTime(cycleState.lastStartedAt)}
                <span className="text-gray-300 ml-1 text-[10px]">BOG</span>
              </span>
            </>
          )}

          {cycleState.lastCompletedAt && (
            <>
              <span className="text-gray-400">Finalización</span>
              <span className="text-gray-500">
                {bogotaDateTime(cycleState.lastCompletedAt)}
                <span className="text-gray-300 ml-1 text-[10px]">· {relativeTime(cycleState.lastCompletedAt)}</span>
              </span>
            </>
          )}

          {/* Cumulative run counters */}
          <span className="text-gray-400">Total ciclos</span>
          <span className="tabular-nums text-gray-700">{cycleState.totalRuns}</span>

          <span className="text-gray-400">Exitosos</span>
          <span className={`tabular-nums ${cycleState.successfulRuns > 0 ? 'text-green-600' : 'text-gray-400'}`}>
            {cycleState.successfulRuns}
          </span>

          {cycleState.failedRuns > 0 && (
            <>
              <span className="text-gray-400">Fallidos</span>
              <span className="tabular-nums text-red-500">{cycleState.failedRuns}</span>
            </>
          )}

          {cycleState.partialRuns > 0 && (
            <>
              <span className="text-gray-400">Parciales</span>
              <span className="tabular-nums text-yellow-600">{cycleState.partialRuns}</span>
            </>
          )}

        </div>
      )}

      {/* ── Mantenimiento (integrado) ─────────────────────────────────── */}
      {maintDisplay && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            Mantenimiento{activeSession ? ' — Activo' : ' — Último'}
          </p>

          <div className="grid grid-cols-[160px_1fr] gap-y-2.5 text-sm">

            <span className="text-gray-400">Tipo</span>
            <span className="font-medium text-gray-700 capitalize">{maintDisplay.mode}</span>

            <span className="text-gray-400">Estado</span>
            <span className={`font-medium ${MAINT_STATUS_META[maintDisplay.status]?.cls ?? 'text-gray-500'}`}>
              {MAINT_STATUS_META[maintDisplay.status]?.label ?? maintDisplay.status}
            </span>

            {maintDisplay.reason && (
              <>
                <span className="text-gray-400">Razón</span>
                <span className="text-gray-600">{maintDisplay.reason}</span>
              </>
            )}

            <span className="text-gray-400">Inicio</span>
            <span className="text-gray-500">
              {bogotaDateTime(maintDisplay.startedAt)}
              <span className="text-gray-300 ml-1 text-[10px]">BOG</span>
            </span>

            {maintDisplay.estimatedEndAt && (
              <>
                <span className="text-gray-400">Fin estimado</span>
                <span className="text-gray-500">
                  {bogotaDateTime(maintDisplay.estimatedEndAt)}
                  <span className="text-gray-300 ml-1 text-[10px]">BOG</span>
                </span>
              </>
            )}

            {maintDisplay.completedAt && (
              <>
                <span className="text-gray-400">Finalizado</span>
                <span className="text-gray-500">{relativeTime(maintDisplay.completedAt)}</span>
              </>
            )}

            {maintDisplay.pipelineId && (
              <>
                <span className="text-gray-400">Pipeline</span>
                <span className="font-mono text-[11px] text-gray-400">{maintDisplay.pipelineId}</span>
              </>
            )}

          </div>
        </div>
      )}

    </section>
  )
}
