/**
 * app/admin/images/page.tsx — Imágenes
 *
 * Calidad visual, salud de imágenes, Repair Center, PA-API readiness.
 * Ruta: /admin/images
 */

import type { Metadata }          from 'next'
import { getAllProducts }          from '@/data/catalog'
import { analyseImageHealth }     from '@/lib/catalog/image-health'
import { generateRepairReport }   from '@/lib/catalog/repair/reports'
import { buildActivationReport }  from '@/lib/ops/activation/reports'
import { PaapiStatusPanel }       from '@/components/ops/PaapiStatusPanel'
import { SectionHeader, Card, StatCard, Th, Td, relativeTime } from '@/components/admin/shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Imágenes — GOODPRICE Internal' }

export default function ImagesPage() {
  const products         = getAllProducts()
  const imageHealth      = analyseImageHealth(products)
  const repairReport     = generateRepairReport()
  const activationReport = buildActivationReport()

  // UX-2: cyan → green (healthy CDN = green, consistent with system color)
  // UX-4: bars already show count+% — removing duplicate StatCards above
  const healthBars = [
    { label: 'Premium — media-amazon.com',         count: imageHealth.premiumCount,   bar: 'bg-green-500',  note: 'CDN actual de Amazon, fiable al 100%' },
    { label: 'Saludables — HTTPS válido',           count: imageHealth.healthyCount,   bar: 'bg-green-400',  note: 'CDN externo, puede requerir monitoreo' },
    { label: 'Degradadas — images-na (deprecated)', count: imageHealth.degradedCount,  bar: 'bg-yellow-400', note: 'CDN deprecado, devuelve 404 — mostrar placeholder' },
    { label: 'Suprimidas — ASIN muerto / inválido', count: imageHealth.suppressedCount,bar: 'bg-red-500',    note: 'Suprimidas de catálogo público (Gate 5E)' },
  ]

  return (
    <div className="space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 pb-5">
        <h1 className="text-base font-bold text-gray-900">Imágenes</h1>
        <p className="text-xs text-gray-400 mt-1">Calidad visual · Salud de CDN · Repair Center · PA-API readiness</p>
      </div>

      {/* ── CDN distribution (UX-4: merged — bars ya muestran counts+%, StatCards duplicaban) */}
      <section>
        <SectionHeader>
          Salud visual — {imageHealth.total} productos · {imageHealth.healthPct}% saludables
          {imageHealth.suppressedCount > 0 && ` · ${imageHealth.suppressedCount} suprimidas`}
        </SectionHeader>
        <Card>
          <div className="space-y-4">
            {healthBars.map(({ label, count, bar, note }) => {
              const pct = imageHealth.total > 0 ? Math.round((count / imageHealth.total) * 100) : 0
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-[11px] font-medium text-gray-700">{label}</span>
                      <span className="text-[10px] text-gray-400 ml-2">{note}</span>
                    </div>
                    <span className="text-[11px] font-bold tabular-nums text-gray-700 flex-shrink-0 ml-4">
                      {count} <span className="text-gray-400 font-normal">({pct}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className={`${bar} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </section>

      {/* ── Repair Center ───────────────────────────────────────────────── */}
      <section>
        <SectionHeader>Repair Center — operaciones de imagen</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard label="Necesitan reparación" value={repairReport.productsNeedingRepair} warn={repairReport.productsNeedingRepair > 0} accent={repairReport.productsNeedingRepair === 0} />
          {/* UX-3: hideIfZero — si nunca se ha reparado nada, no mostrar */}
          <StatCard label="Reparados (historial)" value={repairReport.repairedAllTime} accent={repairReport.repairedAllTime > 0} hideIfZero />
          <StatCard label="Revisión manual" value={repairReport.pendingManualReview} warn={repairReport.pendingManualReview > 0} hideIfZero />
          <StatCard label="Tasa de éxito" value={`${repairReport.successRate}%`} accent={repairReport.successRate >= 70} warn={repairReport.successRate < 40} hideIfZero={repairReport.repairedAllTime === 0} />
        </div>

        {/* Repair by category */}
        {repairReport.byCategory.filter(c => c.needsRepair > 0).length > 0 && (
          <Card className="mb-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Reparación por categoría</p>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <Th>Categoría</Th><Th>Total</Th><Th>Necesitan reparación</Th><Th>Reparados</Th><Th>Revisión manual</Th><Th>PA-API</Th>
                </tr>
              </thead>
              <tbody>
                {repairReport.byCategory
                  .filter(c => c.needsRepair > 0 || c.repaired > 0)
                  .sort((a, b) => b.needsRepair - a.needsRepair)
                  .map(cat => (
                    <tr key={cat.slug} className="border-b border-gray-50 last:border-0">
                      <Td><span className="font-medium capitalize">{cat.slug}</span></Td>
                      <Td muted>{cat.totalProducts}</Td>
                      <Td><span className={cat.needsRepair > 0 ? 'text-red-500 font-bold' : 'text-gray-300'}>{cat.needsRepair}</span></Td>
                      <Td><span className={cat.repaired > 0 ? 'text-green-600 font-semibold' : 'text-gray-300'}>{cat.repaired}</span></Td>
                      <Td><span className={cat.manualReview > 0 ? 'text-yellow-600 font-semibold' : 'text-gray-300'}>{cat.manualReview}</span></Td>{/* UX-2: orange→yellow (warning, not critical) */}
                      <Td><span className={cat.needsPaapi > 0 ? 'text-yellow-600 font-semibold' : 'text-gray-300'}>{cat.needsPaapi}</span></Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Recent replacements */}
        {repairReport.recentReplacements.length > 0 && (
          <Card className="mb-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Reemplazos recientes</p>
            <div className="space-y-2">
              {repairReport.recentReplacements.slice(0, 8).map((r, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0 ${
                    r.status === 'auto_replaced' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>{r.status === 'auto_replaced' ? 'auto' : 'manual'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-700 line-clamp-1">{r.productId}</p>
                    <p className="text-[9px] font-mono text-gray-400">
                      {r.previousAsin}{r.replacementAsin ? ` → ${r.replacementAsin}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{relativeTime(r.timestamp)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Open failures */}
        {repairReport.openFailures.length > 0 && (
          <Card className="border-red-100 bg-red-50/20">
            <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-3">
              Fallos pendientes — {repairReport.openFailures.length} productos
            </p>
            <div className="space-y-2">
              {repairReport.openFailures.slice(0, 6).map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="font-mono text-[10px] text-gray-400 flex-shrink-0">{f.asin}</span>
                  <p className="text-[11px] text-gray-600">{f.reasons.join(', ')}</p>
                  <span className="text-[10px] text-gray-400 flex-shrink-0 ml-auto">{relativeTime(f.attemptedAt)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {repairReport.productsNeedingRepair === 0 && (
          <Card>
            <p className="text-center text-sm text-green-600 font-medium py-6">
              ✅ Todas las imágenes del catálogo están en buen estado.
            </p>
          </Card>
        )}
      </section>

      {/* ── PA-API Status ───────────────────────────────────────────────── */}
      <section>
        <SectionHeader>PA-API Status — recuperación de datos</SectionHeader>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <PaapiStatusPanel initial={activationReport.paapiReadiness} />
        </div>
      </section>

      {/* ── API reference ───────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4 pb-4">
        <p className="text-[10px] text-gray-300">
          Reparación automática (CDN swap + scoring + PA-API):{' '}
          <code className="font-mono">POST /api/catalog/repair/run</code>
        </p>
      </div>
    </div>
  )
}
