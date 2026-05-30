/**
 * app/admin/page.tsx — Executive Dashboard
 *
 * Vista ejecutiva de pantalla única. Jerarquía (UX-7):
 *   1. Estado    — Catalog Health Score (score dominante, UX-1)
 *   2. Problemas — Alert Center consolidado (UX-5)
 *   3. Acciones  — Quick Actions ordenadas por impacto (UX-6)
 *   4. Detalle   — Módulos del sistema + Timeline ×5
 *
 * Server Component — data fetched at render time.
 */

import type { Metadata } from 'next'
import Link              from 'next/link'
import { runHealthCheck }            from '@/lib/ops'
import { buildOpsReport, getAvailableActions } from '@/lib/ops'
import { buildTrustReport }          from '@/lib/catalog/trust/reports'
import { buildOpsSnapshot }          from '@/lib/ops/workspace/realtime-engine'
import { OpsTimeline }               from '@/components/admin/SystemComponents'
import { AlertCenter }               from '@/components/admin/AlertCenter'
import { HealthBar, SectionHeader, Card } from '@/components/admin/shared'
import type { AlertItem }            from '@/components/admin/AlertCenter'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Dashboard — GOODPRICE Internal' }

// ── Action category priority (UX-6) ──────────────────────────────────────────

const ACTION_PRIORITY: Record<string, number> = {
  healing: 0, validation: 1, audit: 2,
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const systemHealth = runHealthCheck()
  const opsReport    = buildOpsReport()
  const quickActions = getAvailableActions()
  const trustReport  = buildTrustReport()
  const snapshot     = buildOpsSnapshot()

  // ── Derived values ──────────────────────────────────────────────────────────

  const visiblePct = trustReport.totalProducts > 0
    ? Math.round((trustReport.visible / trustReport.totalProducts) * 100) : 0

  const healthScore = snapshot.healthScore
  const healthColor =
    healthScore >= 70 ? 'text-green-600' :
    healthScore >= 40 ? 'text-yellow-600' :
    'text-red-500'

  const systemStatus =
    systemHealth.status === 'ok'       ? { label: 'Operacional', cls: 'bg-green-100 text-green-700' } :
    systemHealth.status === 'degraded' ? { label: 'Degradado',   cls: 'bg-yellow-100 text-yellow-700' } :
    systemHealth.status === 'critical' ? { label: 'Crítico',     cls: 'bg-red-100 text-red-700' } :
    { label: 'Desconocido', cls: 'bg-gray-100 text-gray-500' }

  // ── Alert Center data — consolidated (UX-5) ─────────────────────────────────
  const alerts: AlertItem[] = opsReport.alerts.map(a => ({
    id:          a.id,
    severity:    a.severity as AlertItem['severity'],
    title:       a.title,
    description: a.description,
    subsystem:   a.subsystem,
    suggestion:  a.suggestion,
  }))

  // ── Quick Actions — sorted by impact, max 5 (UX-6) ────────────────────────
  const topActions = quickActions
    .slice()
    .sort((a, b) => (ACTION_PRIORITY[a.category] ?? 9) - (ACTION_PRIORITY[b.category] ?? 9))
    .slice(0, 5)

  // ── Module navigation cards ────────────────────────────────────────────────
  const moduleCards = [
    {
      href:  '/admin/ops',
      icon:  '⟳',
      title: 'Operaciones',
      desc:  'Recovery, jobs, self-healing, timeline',
      metric: snapshot.activeJobCount === 0 ? 'Sistema en reposo' : `${snapshot.activeJobCount} jobs activos`,
      metricColor: snapshot.activeJobCount === 0 ? 'text-green-600' : 'text-yellow-600',
    },
    {
      href:  '/admin/catalog',
      icon:  '▤',
      title: 'Catálogo',
      desc:  'Inventario, integridad, inteligencia y consola',
      metric: `${trustReport.totalProducts} productos`,
      metricColor: 'text-blue-600',
    },
    {
      href:  '/admin/audit',
      icon:  '✓',
      title: 'Auditoría',
      desc:  'Reliability scores, trust tiers, quarantine',
      metric: trustReport.suppressed === 0 ? 'Sin suprimidos' : `${trustReport.suppressed} suprimidos`,
      metricColor: trustReport.suppressed > 0 ? 'text-red-600' : 'text-green-600',
    },
    {
      href:  '/admin/images',
      icon:  '⚙',
      title: 'Imágenes',
      desc:  'Calidad visual, CDN health, Repair Center',
      metric: 'Calidad de imagen',
      metricColor: 'text-green-600',                   // UX-2: cyan → green
    },
    {
      href:  '/admin/pricing',
      icon:  '◈',
      title: 'Pricing',
      desc:  'TRM, truth scores, drift, descuentos falsos',
      metric: 'Validación de precios',
      metricColor: 'text-yellow-600',
    },
    {
      href:  '/admin/analytics',
      icon:  '▲',
      title: 'Analytics',
      desc:  'Clicks, ClickShare, engagement por categoría',
      metric: 'Métricas de tráfico',
      metricColor: 'text-indigo-600',                  // UX-2: pink → indigo (informational)
    },
  ]

  return (
    <div className="space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-base font-bold text-gray-900">
            <span className="text-[#F7A823]">GOOD</span>PRICE
            <span className="text-gray-300 font-light mx-2">/</span>
            <span className="text-gray-500 font-normal">Dashboard</span>
          </h1>
        </div>
        <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-400 border border-gray-200">
          🔒 INTERNAL
        </span>
      </div>

      {/* ── 1. ESTADO — Catalog Health Score (UX-1: score dominante) ─────── */}
      <section>
        <Card>
          {/* Title row */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
                Catalog Health Score
              </p>
              <p className="text-[11px] text-gray-400">Score compuesto del sistema</p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${systemStatus.cls}`}>
              {systemStatus.label}
            </span>
          </div>

          {/* Score number */}
          <div className="flex items-end gap-3 mb-3">
            <span className={`text-7xl font-black tabular-nums leading-none ${healthColor}`}>
              {healthScore}
            </span>
            <span className="text-2xl text-gray-300 font-light mb-1.5">/100</span>
          </div>

          {/* Health bar */}
          <HealthBar score={healthScore} className="mb-4" />

          {/* Sub-metrics inline — UX-3: hide if 0 */}
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <span className="text-gray-500">
              Visible:{' '}
              <span className={`font-bold ${visiblePct >= 60 ? 'text-green-600' : visiblePct >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                {visiblePct}%
              </span>
              <span className="text-gray-400 ml-1">({trustReport.visible}/{trustReport.totalProducts})</span>
            </span>

            {/* UX-3: show suprimidos only if > 0 */}
            {trustReport.suppressed > 0 && (
              <span className="text-gray-500">
                Suprimidos: <span className="font-bold text-red-500">{trustReport.suppressed}</span>
              </span>
            )}

            {/* UX-3: show jobs only if > 0 */}
            {snapshot.activeJobCount > 0 && (
              <span className="text-gray-500">
                Jobs: <span className="font-bold text-yellow-600">{snapshot.activeJobCount}</span>
              </span>
            )}

            {/* UX-3: show warnings only if > 0 */}
            {opsReport.alerts.filter(a => a.severity === 'warning').length > 0 && (
              <span className="text-gray-500">
                Avisos:{' '}
                <span className="font-bold text-yellow-600">
                  {opsReport.alerts.filter(a => a.severity === 'warning').length}
                </span>
              </span>
            )}
          </div>
        </Card>
      </section>

      {/* ── 2. PROBLEMAS — Alert Center consolidado (UX-5) ─────────────── */}
      <AlertCenter alerts={alerts} detailHref="/admin/ops" maxPerGroup={3} />

      {/* ── 3. ACCIONES — Quick Actions por impacto (UX-6) ─────────────── */}
      {topActions.length > 0 && (
        <section>
          <SectionHeader>Quick Actions — ordenadas por impacto</SectionHeader>
          <Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {topActions.map(action => (
                <div key={action.id} className="flex items-start gap-2.5 p-2.5 bg-gray-50 rounded-lg">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0 mt-0.5 ${
                    action.category === 'healing'    ? 'bg-green-100 text-green-700' :  // UX-2: healing=green
                    action.category === 'validation' ? 'bg-blue-100 text-blue-700' :
                    action.category === 'audit'      ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-200 text-gray-600'
                  }`}>{action.category}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-gray-700">{action.label}</p>
                    <p className="text-[10px] font-mono text-blue-500 mt-0.5">
                      {action.method} {action.endpoint}
                      {action.durationHint && <span className="text-gray-400 ml-2">{action.durationHint}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-3">
              Ejecución completa y monitoreo en{' '}
              <Link href="/admin/ops" className="text-[#F7A823] font-medium hover:underline">
                Operaciones →
              </Link>
            </p>
          </Card>
        </section>
      )}

      {/* ── 4. DETALLE — Módulos del sistema ───────────────────────────── */}
      <section>
        <SectionHeader>Módulos del sistema</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {moduleCards.map(card => (
            <Link
              key={card.href}
              href={card.href}
              className="group block rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm transition-all duration-150"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg text-gray-400 group-hover:text-[#F7A823] transition-colors">
                  {card.icon}
                </span>
                <span className="text-[10px] text-gray-300 group-hover:text-gray-500 transition-colors">→</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 mb-0.5">{card.title}</p>
              <p className="text-[11px] text-gray-400 leading-snug mb-2">{card.desc}</p>
              <p className={`text-[11px] font-bold ${card.metricColor}`}>{card.metric}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Timeline (5 eventos — UX-3: solo si hay eventos) ───────────── */}
      {opsReport.recentActivity.length > 0 && (
        <OpsTimeline report={opsReport} limit={5} />
      )}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4 pb-4 text-[10px] text-gray-300">
        Acceso protegido por HTTP Basic Auth ·{' '}
        <code className="font-mono">ADMIN_PASSWORD</code>
      </div>
    </div>
  )
}
