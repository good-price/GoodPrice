/**
 * System Health Check Engine
 *
 * Provides a fast, synchronous health snapshot of all GOODPRICE subsystems.
 * Used by:
 *   - GET /api/health (public, no auth)
 *   - /admin dashboard (server component, no extra latency)
 *
 * Design:
 *   - All checks are synchronous (file reads only — no network calls)
 *   - Each subsystem returns: ok | degraded | critical | unknown
 *   - Overall status = worst of all subsystems
 *   - Never throws — any internal error becomes status='unknown'
 *
 * Staleness thresholds:
 *   Job      | ok          | degraded     | critical
 *   ─────────────────────────────────────────────────
 *   audit    | <  7 days   | < 35 days    | > 35 days
 *   pricing  | <  2 hours  | < 25 hours   | > 25 hours
 *   alerts   | <  2 hours  | < 25 hours   | > 25 hours
 *   paapi    | < 14 days   | < 45 days    | > 45 days
 */

import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { getLastExecution } from './job-logger'
import type { JobExecution } from './job-logger'

// ── Types ──────────────────────────────────────────────────────────────────────

export type HealthStatus = 'ok' | 'degraded' | 'critical' | 'unknown'

export interface SubsystemHealth {
  name:          string
  status:        HealthStatus
  message:       string
  lastRunAt?:    string   // ISO — when the subsystem last ran
  lastRunStatus?: string  // 'success' | 'failed' | etc.
  details?:      Record<string, unknown>
}

export interface SystemHealth {
  /** Worst status across all subsystems */
  status:     HealthStatus
  checkedAt:  string
  subsystems: SubsystemHealth[]
  meta: {
    environment: string
    nodeVersion: string
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const HOUR_MS  = 3_600_000
const DAY_MS   = 86_400_000

function ageMs(iso: string | undefined): number {
  if (!iso) return Infinity
  return Date.now() - new Date(iso).getTime()
}

function worstStatus(...statuses: HealthStatus[]): HealthStatus {
  const order: HealthStatus[] = ['critical', 'degraded', 'unknown', 'ok']
  for (const s of order) {
    if (statuses.includes(s)) return s
  }
  return 'ok'
}

function jobToHealth(
  name: string,
  execution: JobExecution | null,
  thresholds: { okMs: number; degradedMs: number },
): SubsystemHealth {
  if (!execution) {
    return { name, status: 'unknown', message: 'Sin ejecuciones registradas' }
  }

  const refTime = execution.completedAt ?? execution.startedAt
  const age = ageMs(refTime)
  const isRunning = execution.status === 'running'
  const isFailed  = execution.status === 'failed'

  if (isRunning) {
    return {
      name, status: 'ok',
      message: 'Ejecutándose ahora',
      lastRunAt: execution.startedAt,
      lastRunStatus: 'running',
    }
  }

  if (isFailed) {
    const ageStr = formatAge(age)
    return {
      name,
      status: age < thresholds.degradedMs ? 'degraded' : 'critical',
      message: `Falló hace ${ageStr}: ${execution.error?.slice(0, 80) ?? 'error desconocido'}`,
      lastRunAt: refTime,
      lastRunStatus: 'failed',
    }
  }

  if (age > thresholds.degradedMs) {
    return {
      name, status: 'critical',
      message: `Sin ejecutar en más de ${formatAge(thresholds.degradedMs)} (último: ${formatAge(age)})`,
      lastRunAt: refTime, lastRunStatus: execution.status,
    }
  }

  if (age > thresholds.okMs) {
    return {
      name, status: 'degraded',
      message: `Último hace ${formatAge(age)} — podría estar retrasado`,
      lastRunAt: refTime, lastRunStatus: execution.status,
      details: { summary: execution.summary },
    }
  }

  return {
    name, status: 'ok',
    message: `OK — hace ${formatAge(age)}`,
    lastRunAt: refTime, lastRunStatus: execution.status,
    details: { summary: execution.summary },
  }
}

function formatAge(ms: number): string {
  if (!isFinite(ms)) return 'nunca'
  if (ms < HOUR_MS)  return `${Math.floor(ms / 60_000)}m`
  if (ms < DAY_MS)   return `${Math.floor(ms / HOUR_MS)}h`
  return `${Math.floor(ms / DAY_MS)}d`
}

// ── Individual checks ──────────────────────────────────────────────────────────

function checkCatalog(): SubsystemHealth {
  try {
    const catalogIndex = join(process.cwd(), 'data', 'catalog', 'index.ts')
    if (!existsSync(catalogIndex)) {
      return { name: 'Catálogo', status: 'critical', message: 'data/catalog/index.ts no encontrado' }
    }
    return {
      name: 'Catálogo',
      status: 'ok',
      message: 'Archivos de catálogo presentes',
    }
  } catch {
    return { name: 'Catálogo', status: 'unknown', message: 'Error verificando catálogo' }
  }
}

function checkAudit(): SubsystemHealth {
  try {
    const lastAudit = join(process.cwd(), 'data', 'audit', 'latest.json')
    const execution  = getLastExecution('audit')

    if (!existsSync(lastAudit) && !execution) {
      return {
        name: 'Auditoría',
        status: 'unknown',
        message: 'Sin auditoría ejecutada aún',
      }
    }

    // If we have a job log entry, use it
    if (execution) {
      return jobToHealth('Auditoría', execution, {
        okMs:       7 * DAY_MS,
        degradedMs: 35 * DAY_MS,
      })
    }

    // Fallback: check file mtime
    const mtime  = statSync(lastAudit).mtime
    const age    = Date.now() - mtime.getTime()
    const status: HealthStatus = age < 7 * DAY_MS ? 'ok' : age < 35 * DAY_MS ? 'degraded' : 'critical'
    return {
      name: 'Auditoría',
      status,
      message: `Último reporte: ${formatAge(age)}`,
      lastRunAt: mtime.toISOString(),
    }
  } catch {
    return { name: 'Auditoría', status: 'unknown', message: 'Error verificando auditoría' }
  }
}

function checkPricing(): SubsystemHealth {
  try {
    const execution = getLastExecution('price-check')
    return jobToHealth('Pricing (ML)', execution, {
      okMs:       2 * HOUR_MS,
      degradedMs: 25 * HOUR_MS,
    })
  } catch {
    return { name: 'Pricing (ML)', status: 'unknown', message: 'Error leyendo job log' }
  }
}

function checkAlerts(): SubsystemHealth {
  try {
    const execution = getLastExecution('alert-detect')
    return jobToHealth('Alertas de precio', execution, {
      okMs:       2 * HOUR_MS,
      degradedMs: 25 * HOUR_MS,
    })
  } catch {
    return { name: 'Alertas de precio', status: 'unknown', message: 'Error leyendo job log' }
  }
}

function checkPaapi(): SubsystemHealth {
  try {
    const hasCredentials =
      Boolean(process.env.PAAPI_ACCESS_KEY) &&
      Boolean(process.env.PAAPI_SECRET_KEY)

    if (!hasCredentials) {
      return {
        name: 'PA-API (imágenes)',
        status: 'degraded',
        message: 'Credenciales no configuradas — imágenes servidas desde caché/stale',
      }
    }

    const execution = getLastExecution('paapi-sync')
    if (!execution) {
      return {
        name: 'PA-API (imágenes)',
        status: 'degraded',
        message: 'Credenciales OK · Sin sync ejecutado aún',
        details: { configured: true },
      }
    }

    return {
      ...jobToHealth('PA-API (imágenes)', execution, {
        okMs:       14 * DAY_MS,
        degradedMs: 45 * DAY_MS,
      }),
      details: { configured: true },
    }
  } catch {
    return { name: 'PA-API (imágenes)', status: 'unknown', message: 'Error verificando PA-API' }
  }
}

function checkDataFiles(): SubsystemHealth {
  try {
    const required = [
      'data/catalog',
      'data/pricing',
      'data/audit',
    ]
    const missing = required.filter(p => !existsSync(join(process.cwd(), p)))
    if (missing.length > 0) {
      return {
        name: 'Archivos de datos',
        status: 'critical',
        message: `Directorios ausentes: ${missing.join(', ')}`,
      }
    }
    return {
      name: 'Archivos de datos',
      status: 'ok',
      message: 'Todos los directorios de datos presentes',
    }
  } catch {
    return { name: 'Archivos de datos', status: 'unknown', message: 'Error verificando archivos' }
  }
}

// ── Main health check ──────────────────────────────────────────────────────────

/**
 * Run all subsystem health checks and return a consolidated report.
 * Fast: only reads local files, no network calls, <5ms.
 */
export function runHealthCheck(): SystemHealth {
  const subsystems: SubsystemHealth[] = [
    checkCatalog(),
    checkDataFiles(),
    checkAudit(),
    checkPricing(),
    checkAlerts(),
    checkPaapi(),
  ]

  const overallStatus = worstStatus(...subsystems.map(s => s.status))

  return {
    status: overallStatus,
    checkedAt: new Date().toISOString(),
    subsystems,
    meta: {
      environment: process.env.NODE_ENV ?? 'unknown',
      nodeVersion: process.version,
    },
  }
}

// Re-export job utilities for use in health consumers
export { getLastExecution, jobAgeMs } from './job-logger'
export type { JobExecution } from './job-logger'
