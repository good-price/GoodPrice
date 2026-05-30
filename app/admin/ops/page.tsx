/**
 * app/admin/ops/page.tsx — Operaciones
 *
 * Centro operativo completo organizado en 4 tabs:
 *   Recovery  — VisibilityAuditPanel + RecoveryCenter
 *   Jobs      — JobCenter + ExecutionConsole
 *   Insights  — OpsCommandCenter + ExecutionInsightsPanel + SelfHealingSection
 *   Timeline  — OpsTimeline completo
 *
 * Server Component — data fetched at render time.
 */

import type { Metadata }          from 'next'
import { buildActivationReport }  from '@/lib/ops/activation/reports'
import { loadRecoveryRun }        from '@/lib/ops/activation/catalog-recovery'
import { buildOpsReport, getAvailableActions } from '@/lib/ops'
import { buildOpsSnapshot }       from '@/lib/ops/workspace/realtime-engine'
import { loadHealingReport }      from '@/lib/catalog/self-healing'
import { RecoveryCenter }         from '@/components/ops/RecoveryCenter'
import { JobCenter }              from '@/components/ops/JobCenter'
import { ExecutionInsightsPanel } from '@/components/ops/ExecutionInsightsPanel'
import { ExecutionConsole }       from '@/components/ops/ExecutionConsole'
import { VisibilityAuditPanel }   from '@/components/ops/VisibilityAuditPanel'
import { OpsCommandCenter, OpsTimeline } from '@/components/admin/SystemComponents'
import { SelfHealingSection }     from '@/components/admin/TrustComponents'
import { AdminTabs }              from '@/components/admin/AdminTabs'
import { SectionHeader, StatCard } from '@/components/admin/shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Operaciones — GOODPRICE Internal' }

export default function OpsPage() {
  const activationReport = buildActivationReport()
  const lastRecoveryRun  = loadRecoveryRun()
  const opsReport        = buildOpsReport()
  const quickActions     = getAvailableActions()
  const snapshot         = buildOpsSnapshot()
  const healingReport    = loadHealingReport()

  const criticalCount   = opsReport.alerts.filter(a => a.severity === 'critical').length
  const stalledQueues   = opsReport.queues.filter(q => q.isStalled).length
  const suppressedCount = healingReport?.suppressedCount ?? 0
  const hasActiveRun    = lastRecoveryRun?.status === 'running'

  const tabs = [
    {
      id:    'recovery',
      label: 'Recovery',
      count: hasActiveRun ? 1 : undefined,
      warn:  hasActiveRun,
    },
    {
      id:    'jobs',
      label: 'Jobs',
      count: snapshot.activeJobCount > 0 ? snapshot.activeJobCount : undefined,
      warn:  false,
    },
    {
      id:    'insights',
      label: 'Insights',
      count: criticalCount > 0 ? criticalCount : undefined,
      warn:  criticalCount > 0,
    },
    {
      id:    'timeline',
      label: 'Timeline',
    },
  ]

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 pb-5">
        <h1 className="text-base font-bold text-gray-900">Operaciones</h1>
        <p className="text-xs text-gray-400 mt-1">Recovery · Jobs · Execution · Self-Healing · Timeline</p>
      </div>

      {/* ── Snapshot KPIs (always visible, outside tabs) ─────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Health Score"
          value={`${snapshot.healthScore}/100`}
          accent={snapshot.healthScore >= 70}
          warn={snapshot.healthScore < 40}
        />
        <StatCard
          label="Jobs activos"
          value={snapshot.activeJobCount}
          accent={snapshot.activeJobCount === 0}
          warn={snapshot.activeJobCount > 3}
        />
        <StatCard
          label="Alertas críticas"
          value={criticalCount}
          warn={criticalCount > 0}
          accent={criticalCount === 0}
        />
        <StatCard
          label="Colas estancadas"
          value={stalledQueues}
          warn={stalledQueues > 0}
          accent={stalledQueues === 0}
        />
      </div>

      {/* ── Tabbed content ───────────────────────────────────────────────── */}
      <AdminTabs tabs={tabs} defaultTab="recovery">

        {/* ── Tab: Recovery ──────────────────────────────────────────────── */}
        <div className="space-y-6">
          <section>
            <SectionHeader>Visibilidad del catálogo — auditoría en tiempo real</SectionHeader>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <VisibilityAuditPanel initial={activationReport.visibilityAudit} />
            </div>
          </section>

          <section>
            <SectionHeader>Recovery Center</SectionHeader>
            <RecoveryCenter
              initialRun={lastRecoveryRun}
              initialAudit={activationReport.visibilityAudit}
            />
          </section>
        </div>

        {/* ── Tab: Jobs ──────────────────────────────────────────────────── */}
        <div className="space-y-6">
          <section>
            <SectionHeader>Jobs — ejecución activa</SectionHeader>
            <JobCenter />
          </section>

          <section>
            <SectionHeader>Execution Console — {snapshot.activeJobCount} jobs en curso</SectionHeader>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <ExecutionConsole initialActiveJobs={snapshot.activeJobs} />
            </div>
          </section>
        </div>

        {/* ── Tab: Insights ──────────────────────────────────────────────── */}
        <div className="space-y-6">
          <OpsCommandCenter report={opsReport} actions={quickActions} />

          <section>
            <SectionHeader>Execution Insights — recomendaciones automáticas</SectionHeader>
            <ExecutionInsightsPanel
              initialInsights={activationReport.insights}
              initialRecommendations={activationReport.recommendations}
            />
          </section>

          <SelfHealingSection report={healingReport} />
        </div>

        {/* ── Tab: Timeline ──────────────────────────────────────────────── */}
        <div>
          <OpsTimeline report={opsReport} />
        </div>

      </AdminTabs>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4 pb-4">
        <p className="text-[10px] text-gray-300">
          Recovery manual:{' '}
          <code className="font-mono">POST /api/ops/recovery/run</code>
          {' · '}Self-healing:{' '}
          <code className="font-mono">POST /api/catalog/self-healing/run</code>
        </p>
      </div>
    </div>
  )
}
