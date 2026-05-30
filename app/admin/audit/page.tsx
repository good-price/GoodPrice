/**
 * app/admin/audit/page.tsx — Auditoría
 *
 * Calidad y confiabilidad del catálogo, organizado en 3 tabs:
 *   Reliability  — AuditSection: reliability scores + quarantine
 *   Trust        — TrustSection: tiers, suppression breakdown, warning badges
 *   Live Truth   — live-truth stats + señales de drift + link health
 *
 * Server Component — data fetched at render time.
 */

import type { Metadata }          from 'next'
import { loadLatestReport }        from '@/lib/audit/report'
import { getQuarantine }           from '@/lib/audit/quarantine'
import { buildTrustReport }        from '@/lib/catalog/trust/reports'
import { loadReport as loadTruthReport } from '@/lib/catalog/live-truth'
import { analyseCatalogLinkHealth } from '@/lib/catalog/link-health'
import { getAllProducts }           from '@/data/catalog'
import { AuditSection }            from '@/components/admin/AuditComponents'
import { TrustSection }            from '@/components/admin/TrustComponents'
import { AdminTabs }               from '@/components/admin/AdminTabs'
import { SectionHeader, Card, StatCard, relativeTime } from '@/components/admin/shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Auditoría — GOODPRICE Internal' }

export default function AuditPage() {
  const auditReport    = loadLatestReport()
  const quarantine     = getQuarantine()
  const quarantineList = Object.values(quarantine.entries)
  const trustReport    = buildTrustReport()
  const truthReport    = loadTruthReport()
  const allProducts    = getAllProducts()
  const linkHealth     = analyseCatalogLinkHealth(allProducts)

  const livePctColor = linkHealth.livePct >= 80 ? 'text-green-600' : linkHealth.livePct >= 60 ? 'text-yellow-600' : 'text-red-500'

  const criticalCount  = auditReport?.criticalProducts.length ?? 0
  const suppressedCount = trustReport.suppressed
  const hasDrift = truthReport !== null &&
    (truthReport.fakeDiscountCount > 0 || truthReport.titleDriftCount > 0 || truthReport.imageDriftCount > 0)

  const tabs = [
    {
      id:    'reliability',
      label: 'Reliability',
      count: criticalCount > 0 ? criticalCount : undefined,
      warn:  criticalCount > 0,
    },
    {
      id:    'trust',
      label: 'Trust & Tiers',
      count: suppressedCount > 0 ? suppressedCount : undefined,
      warn:  suppressedCount > 0,
    },
    {
      id:    'live-truth',
      label: 'Live Truth',
      count: hasDrift ? 1 : undefined,
      warn:  hasDrift,
    },
  ]

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 pb-5">
        <h1 className="text-base font-bold text-gray-900">Auditoría</h1>
        <p className="text-xs text-gray-400 mt-1">
          Reliability scores · Trust tiers · Quarantine · Live truth · Link health
        </p>
      </div>

      {/* ── Tabbed content ───────────────────────────────────────────────── */}
      <AdminTabs tabs={tabs} defaultTab="reliability">

        {/* ── Tab: Reliability ───────────────────────────────────────────── */}
        <div>
          <AuditSection report={auditReport} quarantineList={quarantineList} />
        </div>

        {/* ── Tab: Trust & Tiers ─────────────────────────────────────────── */}
        <div>
          <TrustSection report={trustReport} />
        </div>

        {/* ── Tab: Live Truth ────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Live truth stats */}
          {truthReport !== null ? (
            <section>
              <SectionHeader>Live Truth — validación en tiempo real</SectionHeader>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatCard label="Válidos" value={truthReport.validCount} accent={truthReport.validCount > 0} />
                <StatCard label="Con drift" value={truthReport.driftedCount} warn={truthReport.driftedCount > 0} />
                <StatCard label="No disponibles" value={truthReport.unavailableCount} warn={truthReport.unavailableCount > 0} />
                <StatCard label="Truth score avg" value={truthReport.avgTruthScore} accent={truthReport.avgTruthScore >= 70} warn={truthReport.avgTruthScore < 40} />
              </div>

              {hasDrift && (
                <Card className="mb-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Señales de drift</p>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className={`text-2xl font-bold ${truthReport.fakeDiscountCount > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                        {truthReport.fakeDiscountCount}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Descuentos falsos</p>
                    </div>
                    <div>
                      <p className={`text-2xl font-bold ${truthReport.titleDriftCount > 0 ? 'text-yellow-500' : 'text-gray-300'}`}>
                        {truthReport.titleDriftCount}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Drift de título</p>
                    </div>
                    <div>
                      <p className={`text-2xl font-bold ${truthReport.imageDriftCount > 0 ? 'text-orange-500' : 'text-gray-300'}`}>
                        {truthReport.imageDriftCount}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Drift de imagen</p>
                    </div>
                  </div>
                </Card>
              )}
            </section>
          ) : (
            <section>
              <SectionHeader>Live Truth</SectionHeader>
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

          {/* Link health */}
          <section>
            <SectionHeader>Salud de enlaces Amazon — Gate 9</SectionHeader>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <StatCard label="Accesibles (alive)" value={linkHealth.alive} accent={linkHealth.alive > 0} />
              <StatCard label="Muertos (Gate 9)" value={linkHealth.dead} warn={linkHealth.dead > 0} accent={linkHealth.dead === 0} />
              <StatCard label="Rate-limited" value={linkHealth.rateLimited} warn={linkHealth.rateLimited > 0} />
              <StatCard label="Sin auditar" value={linkHealth.unknown} />
            </div>

            {linkHealth.lastAuditAt ? (
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-700">Distribución de estado de enlace</p>
                  <span className={`text-base font-bold ${livePctColor}`}>{linkHealth.livePct}% vivos</span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: '✅ Accesibles (alive)', count: linkHealth.alive, color: 'bg-green-500', note: 'Página Amazon confirmada' },
                    { label: '❌ Muertos — suprimidos (Gate 9)', count: linkHealth.dead, color: 'bg-red-500', note: '404, redirect a búsqueda/inicio' },
                    { label: '⏳ Rate-limited', count: linkHealth.rateLimited, color: 'bg-amber-400', note: '429/503/CAPTCHA' },
                    { label: '❓ Sin auditar', count: linkHealth.unknown, color: 'bg-gray-300', note: 'Pasan por defecto' },
                  ].map(({ label, count, color, note }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-600">{label}</span>
                        <span className="text-xs font-semibold tabular-nums text-gray-700">{count}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`${color} h-1.5 rounded-full`}
                            style={{ width: `${linkHealth.total > 0 ? Math.round((count / linkHealth.total) * 100) : 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 w-48 text-right">{note}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-gray-400 space-y-1 mt-3">
                  <p>
                    Última auditoría:{' '}
                    <span className="text-gray-600 font-medium">{relativeTime(linkHealth.lastAuditAt!)}</span>
                    {' '}· {linkHealth.total} productos
                  </p>
                  {linkHealth.dead > 0 && (
                    <p><span className="text-red-500 font-semibold">{linkHealth.dead}</span> enlaces muertos suprimidos por Gate 9.</p>
                  )}
                  <p>Cron recomendado: <code className="font-mono bg-gray-100 px-1 rounded">0 9 * * *</code></p>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="text-center py-8">
                  <p className="text-sm font-medium text-gray-500">Sin auditoría de enlaces ejecutada aún</p>
                  <p className="text-xs text-gray-400 mt-3 font-mono bg-gray-50 inline-block px-3 py-1.5 rounded-lg">
                    POST /api/catalog/link-audit/run
                  </p>
                </div>
              </Card>
            )}
          </section>
        </div>

      </AdminTabs>
    </div>
  )
}
