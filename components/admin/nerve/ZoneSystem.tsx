/**
 * components/admin/nerve/ZoneSystem.tsx
 *
 * Nerve Center — Zona 1: SISTEMA
 *
 * Muestra:
 *   Health Score · Modo · Sitio Público · Mantenimiento
 *   Último ciclo exitoso · Datos (sync status)
 *
 * Server Component. Sin lógica de negocio.
 */

import Link from 'next/link'
import type { SystemHealth }       from '@/lib/ops/runtime'
import type { MaintenanceSession } from '@/lib/ops/maintenance'
import type { SiteModeState }      from '@/lib/system/site-mode'

interface Props {
  health:            SystemHealth
  maintenance:       MaintenanceSession | null
  siteMode:          SiteModeState
  lastSuccessfulAt:  string | null
  syncedAt:          string | null
}

const MODE_META: Record<string, { label: string; cls: string }> = {
  public:                { label: 'PUBLIC',                cls: 'text-green-600' },
  development:           { label: 'DEVELOPMENT',           cls: 'text-yellow-600' },
  maintenance:           { label: 'MAINTENANCE',           cls: 'text-orange-500' },
  scheduled_maintenance: { label: 'SCHEDULED_MAINTENANCE', cls: 'text-yellow-600' },
}

const PUBLIC_STATUS: Record<string, { label: string; cls: string }> = {
  public:                { label: 'Disponible',             cls: 'text-green-600' },
  development:           { label: 'En desarrollo',          cls: 'text-yellow-600' },
  maintenance:           { label: 'Bloqueado',              cls: 'text-red-500' },
  scheduled_maintenance: { label: 'Bloqueado temporalmente',cls: 'text-yellow-600' },
}

function bogotaTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
    timeZone: 'America/Bogota',
  }).format(new Date(iso))
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)     return 'ahora mismo'
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m atrás`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h atrás`
  return `${Math.floor(ms / 86_400_000)}d atrás`
}

export function ZoneSystem({
  health,
  maintenance,
  siteMode,
  lastSuccessfulAt,
  syncedAt,
}: Props) {
  const modeMeta   = MODE_META[siteMode.mode]   ?? MODE_META['public']!
  const publicMeta = PUBLIC_STATUS[siteMode.mode] ?? PUBLIC_STATUS['public']!

  const scoreColor =
    health.healthScore >= 70 ? 'text-green-600' :
    health.healthScore >= 40 ? 'text-yellow-600' :
    'text-red-500'

  // Sync status: > 1 día → desactualizado
  const syncMs     = syncedAt ? Date.now() - new Date(syncedAt).getTime() : null
  const syncLabel  = syncedAt
    ? syncMs! > 86_400_000
      ? `Información desactualizada ${relativeTime(syncedAt)}`
      : `Sistema sincronizado ${relativeTime(syncedAt)}`
    : null
  const syncColor = syncMs !== null && syncMs > 86_400_000
    ? 'text-yellow-600'
    : 'text-gray-500'

  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Sistema
      </p>

      <div className="grid grid-cols-[160px_1fr] gap-y-3 text-sm">

        <span className="text-gray-400">Health Score</span>
        <span className={`font-bold tabular-nums ${scoreColor}`}>
          {health.healthScore}
          <span className="text-gray-300 font-normal ml-1">/ 100</span>
        </span>

        <span className="text-gray-400">Modo</span>
        <span className={`font-mono font-bold text-[12px] ${modeMeta.cls}`}>
          {modeMeta.label}
        </span>

        <span className="text-gray-400">Sitio Público</span>
        <span className={`font-semibold ${publicMeta.cls}`}>
          {publicMeta.label}
        </span>

        <span className="text-gray-400">Mantenimiento</span>
        {maintenance ? (
          <div className="space-y-0.5">
            <span className="font-semibold text-yellow-600 capitalize">{maintenance.mode}</span>
            {maintenance.reason && (
              <p className="text-[11px] text-gray-400">{maintenance.reason}</p>
            )}
            {maintenance.estimatedEndAt && (
              <p className="text-[11px] text-gray-400">
                Finaliza estimado:{' '}
                <span className="font-mono">{bogotaTime(maintenance.estimatedEndAt)}</span>
                {' '}Bogotá
              </p>
            )}
          </div>
        ) : (
          <span className="text-gray-500">Ninguno</span>
        )}

        <span className="text-gray-400">Último exitoso</span>
        <span className="text-gray-500">
          {lastSuccessfulAt ? relativeTime(lastSuccessfulAt) : '—'}
        </span>

        {syncLabel && (
          <>
            <span className="text-gray-400">Datos</span>
            <span className={`text-[12px] ${syncColor}`}>{syncLabel}</span>
          </>
        )}

      </div>

      <div className="mt-5 text-right">
        <Link
          href="/admin/system"
          className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
        >
          System Center →
        </Link>
      </div>
    </section>
  )
}
