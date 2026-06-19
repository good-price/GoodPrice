/**
 * components/admin/SystemComponents.tsx
 *
 * System health badges and operational timeline.
 * OpsCommandCenter removed (OPS V2 Fase 1 — duplicaba Dashboard).
 */

import type { SystemHealth } from '@/lib/ops'
import type { OpsReport } from '@/lib/ops'
import { SectionHeader, Card, Th, Td, relativeTime } from './shared'

// ── HealthStatusBadge ─────────────────────────────────────────────────────────

export function HealthStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ok:       'bg-green-100 text-green-700',
    degraded: 'bg-yellow-100 text-yellow-700',
    critical: 'bg-red-100 text-red-700',
    unknown:  'bg-gray-100 text-gray-500',
  }
  const dot: Record<string, string> = {
    ok: 'bg-green-500', degraded: 'bg-yellow-400', critical: 'bg-red-500', unknown: 'bg-gray-400',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded uppercase ${map[status] ?? map.unknown}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status] ?? dot.unknown}`} />
      {status}
    </span>
  )
}

// ── SystemHealthSection ───────────────────────────────────────────────────────

export function SystemHealthSection({ health }: { health: SystemHealth }) {
  const overallColors: Record<string, string> = {
    ok:       'border-green-200 bg-green-50',
    degraded: 'border-yellow-200 bg-yellow-50',
    critical: 'border-red-200 bg-red-50',
    unknown:  'border-gray-200 bg-gray-50',
  }
  const overallColor = overallColors[health.status] ?? overallColors.unknown

  return (
    <section>
      <SectionHeader>Estado del sistema</SectionHeader>
      <div className={`border rounded-xl px-4 py-3 mb-4 flex items-center justify-between ${overallColor}`}>
        <div className="flex items-center gap-3">
          <HealthStatusBadge status={health.status} />
          <p className="text-sm font-medium text-gray-700">
            {health.status === 'ok'       && 'Todos los subsistemas operando correctamente'}
            {health.status === 'degraded' && 'Algunos subsistemas necesitan atención'}
            {health.status === 'critical' && 'Fallos críticos detectados — acción inmediata requerida'}
            {health.status === 'unknown'  && 'Estado del sistema desconocido'}
          </p>
        </div>
        <span className="text-[10px] text-gray-400">{relativeTime(health.checkedAt)}</span>
      </div>
      <Card>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <Th>Subsistema</Th><Th>Estado</Th><Th>Último run</Th><Th>Mensaje</Th>
            </tr>
          </thead>
          <tbody>
            {health.subsystems.map(sub => (
              <tr key={sub.name} className="border-b border-gray-50 last:border-0">
                <Td><span className="font-medium">{sub.name}</span></Td>
                <td className="py-2 pr-4"><HealthStatusBadge status={sub.status} /></td>
                <Td muted>
                  {sub.lastRunAt ? relativeTime(sub.lastRunAt) : '—'}
                  {sub.lastRunStatus && (
                    <span className={`ml-1 text-[10px] font-medium ${
                      sub.lastRunStatus === 'success' ? 'text-green-600' :
                      sub.lastRunStatus === 'failed'  ? 'text-red-500'  :
                      sub.lastRunStatus === 'partial' ? 'text-yellow-600' : 'text-gray-400'
                    }`}>({sub.lastRunStatus})</span>
                  )}
                </Td>
                <Td><span className="text-[11px] text-gray-600">{sub.message}</span></Td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-gray-400 mt-3">
          <code className="font-mono bg-gray-100 px-1 rounded">GET /api/health</code>{' '}
          — endpoint público para monitores externos
        </p>
      </Card>
    </section>
  )
}

// ── AlertBadge ────────────────────────────────────────────────────────────────

export function AlertBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border border-red-200',
    warning:  'bg-yellow-100 text-yellow-700 border border-yellow-200',
    info:     'bg-blue-100 text-blue-600 border border-blue-200',
  }
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${map[severity] ?? 'bg-gray-100 text-gray-500'}`}>
      {severity}
    </span>
  )
}

// ── SubsystemBadge ────────────────────────────────────────────────────────────

export function SubsystemBadge({ subsystem }: { subsystem: string }) {
  const colors: Record<string, string> = {
    'live-truth': 'bg-blue-100 text-blue-700', 'self-healing': 'bg-purple-100 text-purple-700',
    'quarantine': 'bg-red-100 text-red-600', 'intelligence': 'bg-green-100 text-green-700',
    'link-health': 'bg-orange-100 text-orange-700', 'colombia': 'bg-yellow-100 text-yellow-700',
    'repair': 'bg-cyan-100 text-cyan-700', 'pricing': 'bg-pink-100 text-pink-700',
    'ops': 'bg-gray-100 text-gray-600',
  }
  const label: Record<string, string> = {
    'live-truth': 'Live Truth', 'self-healing': 'Self-Heal', 'quarantine': 'Quarantine',
    'intelligence': 'Intel', 'link-health': 'Links', 'colombia': 'Colombia',
    'repair': 'Repair', 'pricing': 'Pricing', 'ops': 'Ops',
  }
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${colors[subsystem] ?? 'bg-gray-100 text-gray-600'}`}>
      {label[subsystem] ?? subsystem}
    </span>
  )
}

// ── OpsTimeline ───────────────────────────────────────────────────────────────

export function OpsTimeline({ report, limit }: { report: OpsReport; limit?: number }) {
  const events = limit ? report.recentActivity.slice(0, limit) : report.recentActivity
  if (events.length === 0) {
    return (
      <section>
        <SectionHeader>Timeline operacional</SectionHeader>
        <Card><p className="text-center text-sm text-gray-400 py-6">Sin eventos operacionales aún.</p></Card>
      </section>
    )
  }
  return (
    <section>
      <SectionHeader>Timeline operacional — {events.length} eventos recientes</SectionHeader>
      <Card>
        <div className="relative space-y-0">
          {events.map((event, i) => (
            <div key={event.id} className={`flex items-start gap-3 py-3 ${i < events.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50/50 transition-colors`}>
              <div className="flex flex-col items-center flex-shrink-0 w-5 mt-0.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${event.severity === 'critical' ? 'bg-red-500' : event.severity === 'warning' ? 'bg-yellow-400' : 'bg-green-400'}`} />
                {i < events.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1 min-h-[8px]" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <SubsystemBadge subsystem={event.subsystem} />
                  <p className="text-xs font-semibold text-gray-800 line-clamp-1">{event.title}</p>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug line-clamp-2">{event.description}</p>
                {event.asin && <p className="text-[9px] font-mono text-gray-400 mt-0.5">{event.asin}</p>}
              </div>
              <p className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">{relativeTime(event.ts)}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-3">
          GET <code className="font-mono bg-gray-100 px-1 rounded">/api/ops/activity</code>{' '}
          para el timeline completo.
        </p>
      </Card>
    </section>
  )
}
