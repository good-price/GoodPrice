/**
 * components/admin/SystemComponents.tsx
 *
 * System health, ops command center, and operational timeline.
 * Used in /admin (dashboard) and /admin/ops.
 */

import type { SystemHealth } from '@/lib/ops'
import type { OpsReport, QuickAction } from '@/lib/ops'
import { SectionHeader, Card, StatCard, Th, Td, relativeTime } from './shared'

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

// ── OpsCommandCenter ──────────────────────────────────────────────────────────

export function OpsCommandCenter({ report, actions }: { report: OpsReport; actions: QuickAction[] }) {
  const { health, alerts, anomalies, queues, diagnostics } = report
  const criticalAlerts = alerts.filter(a => a.severity === 'critical')
  const warningAlerts  = alerts.filter(a => a.severity === 'warning')
  const criticalDiags  = diagnostics.filter(d => d.severity === 'critical')
  const warningDiags   = diagnostics.filter(d => d.severity === 'warning')
  const stalledQueues  = queues.filter(q => q.isStalled)
  const overallOk      = criticalAlerts.length === 0 && anomalies.filter(a => a.severity === 'critical').length === 0

  return (
    <section>
      <SectionHeader>Centro de Operaciones — platform health</SectionHeader>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card className={`sm:col-span-1 ${overallOk ? 'border-green-200' : 'border-red-200'}`}>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Score de Plataforma</p>
          <div className="flex items-center gap-3">
            <div>
              <p className={`text-5xl font-black tabular-nums ${
                health.overall >= 80 ? 'text-green-600' : health.overall >= 60 ? 'text-cyan-600' :
                health.overall >= 40 ? 'text-yellow-500' : 'text-red-600'
              }`}>{health.overall}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">/ 100</p>
            </div>
            <div className="flex-1 space-y-1">
              {[
                { dim: 'Verdad',      val: health.truthHealth },
                { dim: 'Catálogo',    val: health.catalogHealth },
                { dim: 'Supresiones', val: health.suppressionHealth },
                { dim: 'Colas',       val: health.queueHealth },
                { dim: 'Frescura',    val: health.freshnessHealth },
                { dim: 'Disp.',       val: health.availabilityHealth },
              ].map(({ dim, val }) => (
                <div key={dim} className="flex items-center gap-1.5">
                  <span className="text-[9px] text-gray-400 w-16">{dim}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-1 overflow-hidden">
                    <div className={`h-1 rounded-full ${val >= 70 ? 'bg-green-500' : val >= 40 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${val}%` }} />
                  </div>
                  <span className="text-[9px] tabular-nums text-gray-500 w-6 text-right">{val}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[9px] text-gray-400 mt-3">Calculado: {relativeTime(health.computedAt)}</p>
        </Card>
        <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard label="Alertas críticas" value={criticalAlerts.length} warn={criticalAlerts.length > 0} accent={criticalAlerts.length === 0} />
          <StatCard label="Avisos" value={warningAlerts.length} warn={warningAlerts.length > 2} />
          <StatCard label="Anomalías" value={anomalies.length} warn={anomalies.length > 0} />
          <StatCard label="Colas estancadas" value={stalledQueues.length} warn={stalledQueues.length > 0} accent={stalledQueues.length === 0} />
        </div>
      </div>

      {alerts.length > 0 && (
        <Card className="mb-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Alertas activas ({alerts.length})</p>
          <div className="space-y-2.5">
            {alerts.map(alert => (
              <div key={alert.id} className={`flex items-start gap-3 p-2.5 rounded-lg ${
                alert.severity === 'critical' ? 'bg-red-50' : alert.severity === 'warning' ? 'bg-yellow-50' : 'bg-blue-50'
              }`}>
                <AlertBadge severity={alert.severity} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">{alert.title}</p>
                  <p className="text-[11px] text-gray-600 mt-0.5 leading-snug">{alert.description}</p>
                  {alert.suggestion && <p className="text-[10px] text-gray-400 mt-1 font-mono">{alert.suggestion}</p>}
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{alert.subsystem}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {anomalies.length > 0 && (
        <Card className="mb-4 border-orange-100 bg-orange-50/30">
          <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide mb-3">Anomalías detectadas ({anomalies.length})</p>
          <div className="space-y-2">
            {anomalies.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${a.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{a.severity}</span>
                <div>
                  <p className="text-[11px] text-gray-700 font-medium">{a.type.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-gray-500">{a.description}</p>
                  <p className="text-[9px] text-gray-400 mt-0.5">Valor: <span className="font-semibold text-gray-600">{a.value}</span> · Umbral: {a.threshold}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        {queues.map(q => (
          <Card key={q.name} className={q.isStalled ? 'border-orange-200' : ''}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-semibold text-gray-700">{q.name}</p>
              {q.isStalled && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 uppercase">estancada</span>}
            </div>
            <p className={`text-2xl font-bold ${q.size > 0 ? 'text-gray-800' : 'text-gray-300'}`}>{q.size}</p>
            <p className="text-[10px] text-gray-400 mt-1">{q.lastActivityAt ? `Última actividad: ${relativeTime(q.lastActivityAt)}` : 'Sin actividad registrada'}</p>
          </Card>
        ))}
      </div>

      {(criticalDiags.length > 0 || warningDiags.length > 0) && (
        <Card className="mb-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Diagnósticos — {diagnostics.length} issues</p>
          <div className="space-y-2">
            {diagnostics.filter(d => d.severity !== 'info').map((d, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertBadge severity={d.severity} />
                <div className="flex-1">
                  <p className="text-[11px] text-gray-700">{d.description}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{d.suggestion}</p>
                </div>
                <span className="text-[9px] text-gray-400 flex-shrink-0">{d.subsystem}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Acciones rápidas — {actions.length} disponibles</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {actions.map(action => (
            <div key={action.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0 ${
                action.category === 'validation' ? 'bg-blue-100 text-blue-700' :
                action.category === 'healing'    ? 'bg-purple-100 text-purple-700' :
                action.category === 'audit'      ? 'bg-orange-100 text-orange-700' :
                'bg-gray-200 text-gray-600'
              }`}>{action.category}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-gray-700">{action.label}</p>
                <p className="text-[10px] text-gray-400 line-clamp-1">{action.description}</p>
                <p className="text-[9px] font-mono text-blue-500 mt-0.5">
                  {action.method} {action.endpoint}
                  {action.durationHint && <span className="text-gray-400 ml-2">{action.durationHint}</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-3">
          POST <code className="font-mono bg-gray-100 px-1 rounded">/api/ops/actions</code>{' '}
          con <code className="font-mono bg-gray-100 px-1 rounded">{`{ "action": "id" }`}</code> para ejecutar.
        </p>
      </Card>
    </section>
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
