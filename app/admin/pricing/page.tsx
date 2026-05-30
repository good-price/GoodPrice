/**
 * app/admin/pricing/page.tsx — Pricing
 *
 * Jerarquía visual (UX-7): Estado → Problemas → Acciones → Detalle
 *
 *   Estado:    Pricing Health dimension del Catalog Health Score
 *   Problemas: Señales de drift (solo si existen) — mostradas UNA SOLA VEZ (UX-4)
 *   Acciones:  TRM + revalidación
 *   Detalle:   Truth scores, Truth Queue, PA-API
 *
 * Ruta: /admin/pricing
 */

import type { Metadata }          from 'next'
import { buildStabilizationReport } from '@/lib/catalog/stabilization'
import { buildActivationReport }  from '@/lib/ops/activation/reports'
import { loadReport as loadTruthReport } from '@/lib/catalog/live-truth'
import { TrmStatusPanel }         from '@/components/ops/TrmStatusPanel'
import { TruthQueuePanel }        from '@/components/ops/TruthQueuePanel'
import { PaapiStatusPanel }       from '@/components/ops/PaapiStatusPanel'
import { SectionHeader, Card, StatCard, HealthBar } from '@/components/admin/shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Pricing — GOODPRICE Internal' }

export default async function PricingPage() {
  const stabilization    = await buildStabilizationReport()
  const activationReport = buildActivationReport()
  const truthReport      = loadTruthReport()

  const { pricingHealth } = stabilization
  const pricingScore    = Math.round(100 - pricingHealth.unreliablePct)
  const totalChecked    = truthReport?.totalChecked ?? 0
  const needsRevalCount = pricingHealth.needsRevalidation.length
  const freshCount      = Math.max(0, pricingHealth.totalAnalyzed - pricingHealth.staleCount - pricingHealth.driftedCount)

  // Detect active problems for drift signals section
  const hasDrift = truthReport !== null &&
    (truthReport.fakeDiscountCount > 0 || truthReport.titleDriftCount > 0 || truthReport.imageDriftCount > 0)
  const hasStale = pricingHealth.staleCount > 0
  const hasIssues = hasDrift || hasStale || pricingHealth.fakDiscountCount > 0

  return (
    <div className="space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 pb-5">
        <h1 className="text-base font-bold text-gray-900">Pricing</h1>
        <p className="text-xs text-gray-400 mt-1">TRM · Pricing health · Truth scores · Drift · Pricing recovery</p>
      </div>

      {/* ── 1. ESTADO — Pricing Health (dimensión del score global) ─────── */}
      {/* UX-1: sub-dimensión del Catalog Health Score, no score competidor  */}
      <section>
        <SectionHeader>Pricing Health — dimensión del Catalog Health Score</SectionHeader>
        <Card>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
                Pricing Health
              </p>
              <div className="flex items-end gap-2">
                <span className={`text-5xl font-black tabular-nums leading-none ${
                  pricingScore >= 70 ? 'text-green-600' : pricingScore >= 40 ? 'text-yellow-600' : 'text-red-500'
                }`}>{pricingScore}</span>
                <span className="text-lg text-gray-300 font-light mb-1">/100</span>
              </div>
            </div>
            {/* Sub-metrics inline — UX-3: hideIfZero */}
            <div className="text-right space-y-1">
              {pricingHealth.staleCount > 0 && (
                <p className="text-[11px] text-gray-500">
                  Stale: <span className="font-bold text-yellow-600">{pricingHealth.staleCount}</span>
                </p>
              )}
              {pricingHealth.fakDiscountCount > 0 && (
                <p className="text-[11px] text-gray-500">
                  Falsos: <span className="font-bold text-red-500">{pricingHealth.fakDiscountCount}</span>
                </p>
              )}
              {needsRevalCount > 0 && (
                <p className="text-[11px] text-gray-500">
                  Revalidar: <span className="font-bold text-yellow-600">{needsRevalCount}</span>
                </p>
              )}
              {!hasIssues && (
                <p className="text-[11px] text-green-600 font-bold">Sin problemas</p>
              )}
            </div>
          </div>
          <HealthBar score={pricingScore} className="mb-3" />
          {/* Breakdown bars — UX-4: muestra distribución sin repetir números */}
          <div className="space-y-2 mt-4">
            {[
              { label: 'Frescos (sin drift)',        count: freshCount,                     bar: 'bg-green-400' },
              { label: 'Con drift (>30%)',           count: pricingHealth.driftedCount,     bar: 'bg-yellow-400' },
              { label: 'Obsoletos (>7d sin validar)',count: pricingHealth.staleCount,       bar: 'bg-orange-400' },
            ].map(({ label, count, bar }) => {
              const pct = pricingHealth.totalAnalyzed > 0
                ? Math.round((count / pricingHealth.totalAnalyzed) * 100) : 0
              if (count === 0) return null  // UX-3: hide zero bars
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-gray-500">{label}</span>
                    <span className="text-[10px] tabular-nums text-gray-600 font-medium">
                      {count} <span className="text-gray-400">({pct}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className={`${bar} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </section>

      {/* ── 2. PROBLEMAS — Drift signals (UX-4: mostrado UNA VEZ aquí) ─── */}
      {/* UX-3: solo si hay drift detectado                                 */}
      {hasDrift && truthReport && (
        <section>
          <SectionHeader>Señales de drift — problemas detectados</SectionHeader>
          <Card className="border-yellow-100 bg-yellow-50/20">
            <div className="grid grid-cols-3 gap-6 text-center">
              {truthReport.fakeDiscountCount > 0 && (
                <div>
                  <p className="text-3xl font-black text-red-500">{truthReport.fakeDiscountCount}</p>
                  <p className="text-[11px] text-gray-600 mt-1 font-medium">Descuentos falsos</p>
                  <p className="text-[10px] text-gray-400">Descuento &gt;65% no verificable</p>
                </div>
              )}
              {truthReport.titleDriftCount > 0 && (
                <div>
                  <p className="text-3xl font-black text-yellow-600">{truthReport.titleDriftCount}</p>
                  <p className="text-[11px] text-gray-600 mt-1 font-medium">Drift de título</p>
                  <p className="text-[10px] text-gray-400">Título Amazon ≠ catálogo</p>
                </div>
              )}
              {truthReport.imageDriftCount > 0 && (
                <div>
                  <p className="text-3xl font-black text-yellow-600">{truthReport.imageDriftCount}</p>
                  <p className="text-[11px] text-gray-600 mt-1 font-medium">Drift de imagen</p>
                  <p className="text-[10px] text-gray-400">Imagen cambiada en Amazon</p>
                </div>
              )}
            </div>
            {/* UX-7: acción inmediata sugerida */}
            <p className="text-[10px] text-gray-400 mt-4 text-center font-mono">
              Revalidar:{' '}
              <span className="bg-gray-100 px-2 py-0.5 rounded">POST /api/catalog/live-truth/run</span>
            </p>
          </Card>
        </section>
      )}

      {/* ── 3. ACCIONES — TRM (monitoreo de tasa de cambio) ─────────────── */}
      <section>
        <SectionHeader>TRM — Tasa Representativa del Mercado</SectionHeader>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <TrmStatusPanel initial={activationReport.trmStatus} />
        </div>
      </section>

      {/* ── 4. DETALLE — Truth scores (solo si existen datos) ──────────── */}
      {truthReport !== null ? (
        <section>
          <SectionHeader>Truth Scores — {totalChecked} productos validados</SectionHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard
              label="Válidos"
              value={truthReport.validCount}
              accent={truthReport.validCount > 0}
              info={truthReport.validCount === 0}
            />
            <StatCard label="Con drift" value={truthReport.driftedCount} warn={truthReport.driftedCount > 0} hideIfZero />
            <StatCard label="No disponibles" value={truthReport.unavailableCount} warn={truthReport.unavailableCount > 0} hideIfZero />
            <StatCard
              label="Score truth avg"
              value={truthReport.avgTruthScore}
              accent={truthReport.avgTruthScore >= 70}
              warn={truthReport.avgTruthScore < 40}
            />
          </div>
          {/* Secondary truth stats — UX-3: only show if any > 0 */}
          {((truthReport.suspectCount ?? 0) > 0 || (truthReport.failedCount ?? 0) > 0 || truthReport.quarantineRecommendations.length > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Sospechosos (40–69)" value={truthReport.suspectCount ?? 0} warn={(truthReport.suspectCount ?? 0) > 0} hideIfZero />
              <StatCard label="Fallidos" value={truthReport.failedCount ?? 0} warn={(truthReport.failedCount ?? 0) > 0} hideIfZero />
              <StatCard label="Cuarentena recom." value={truthReport.quarantineRecommendations.length} warn={truthReport.quarantineRecommendations.length > 0} hideIfZero />
            </div>
          )}
        </section>
      ) : (
        <section>
          <SectionHeader>Truth Scores</SectionHeader>
          <Card>
            <div className="text-center py-8">
              <p className="text-sm font-medium text-gray-500">Sin validación live truth ejecutada aún</p>
              <p className="text-xs text-gray-400 mt-3 font-mono bg-gray-50 inline-block px-3 py-1.5 rounded-lg">
                POST /api/catalog/live-truth/run
              </p>
            </div>
          </Card>
        </section>
      )}

      {/* ── Truth Queue ──────────────────────────────────────────────────── */}
      <section>
        <SectionHeader>Truth Queue — cola de validación</SectionHeader>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <TruthQueuePanel initial={activationReport.truthQueue} />
        </div>
      </section>

      {/* ── PA-API readiness ─────────────────────────────────────────────── */}
      <section>
        <SectionHeader>PA-API Readiness — recuperación de datos</SectionHeader>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <PaapiStatusPanel initial={activationReport.paapiReadiness} />
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4 pb-4">
        <p className="text-[10px] text-gray-300">
          Revalidación masiva:{' '}
          <code className="font-mono">POST /api/catalog/live-truth/run</code>
          {totalChecked > 0 && ` · ${totalChecked} productos`}
        </p>
      </div>
    </div>
  )
}
