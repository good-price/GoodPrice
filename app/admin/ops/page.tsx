/**
 * app/admin/ops/page.tsx — Operaciones
 *
 * Centro operativo de jobs y recovery. 2 tabs:
 *   Recovery — RecoveryCenter
 *   Jobs     — JobCenter + ExecutionConsole
 *
 * Tabs eliminados (OPS V2 Fase 1):
 *   Insights  — duplicaba Dashboard (OpsCommandCenter) y self-healing es automático
 *   Timeline  — idéntico al que ya existe en Dashboard
 *
 * Server Component — data fetched at render time.
 */

import type { Metadata }         from 'next'
import { buildActivationReport } from '@/lib/ops/activation/reports'
import { loadRecoveryRun }       from '@/lib/ops/activation/catalog-recovery'
import { buildOpsSnapshot }      from '@/lib/ops/workspace/realtime-engine'
import { RecoveryCenter }        from '@/components/ops/RecoveryCenter'
import { JobCenter }             from '@/components/ops/JobCenter'
import { ExecutionConsole }      from '@/components/ops/ExecutionConsole'
import { AdminTabs }             from '@/components/admin/AdminTabs'
import { SectionHeader, StatCard } from '@/components/admin/shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Operaciones — GOODPRICE Internal' }

export default function OpsPage() {
  const activationReport = buildActivationReport()
  const lastRecoveryRun  = loadRecoveryRun()
  const snapshot         = buildOpsSnapshot()

  const hasActiveRun = lastRecoveryRun?.status === 'running'

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
  ]

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 pb-5">
        <h1 className="text-base font-bold text-gray-900">Operaciones</h1>
        <p className="text-xs text-gray-400 mt-1">Recovery · Jobs · Execution</p>
      </div>

      {/* ── Snapshot KPIs (always visible, outside tabs) ─────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
          label="Visibles"
          value={snapshot.visibility.active + snapshot.visibility.warning + snapshot.visibility.degraded}
          accent
        />
      </div>

      {/* ── Tabbed content ───────────────────────────────────────────────── */}
      <AdminTabs tabs={tabs} defaultTab="recovery">

        {/* ── Tab: Recovery ──────────────────────────────────────────────── */}
        <div className="space-y-6">
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

      </AdminTabs>

    </div>
  )
}
