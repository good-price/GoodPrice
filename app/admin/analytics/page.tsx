/**
 * app/admin/analytics/page.tsx — Analytics
 *
 * ClickShare, tráfico, CTR, engagement, performance por categoría.
 * Ruta: /admin/analytics
 */

import type { Metadata }            from 'next'
import { buildObservabilityReport, buildCatalogMetrics } from '@/lib/analytics'
import { SectionHeader, Card, StatCard, Th, Td, relativeTime } from '@/components/admin/shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Analytics — GOODPRICE Internal' }

export default async function AnalyticsPage() {
  const [obs, catalog] = await Promise.all([
    buildObservabilityReport(),
    buildCatalogMetrics(),
  ])

  const { summary, topProducts, topCategories, insights } = obs
  const deadProductRateNum = summary.catalogSize > 0
    ? Math.round((summary.productsWithZeroClicks / summary.catalogSize) * 100)
    : 0

  // UX-3: pantalla vacía global — no renderizar nada si no hay datos
  const noData = summary.totalEvents === 0

  const header = (
    <div className="border-b border-gray-200 pb-5">
      <h1 className="text-base font-bold text-gray-900">Analytics</h1>
      <p className="text-xs text-gray-400 mt-1">ClickShare · Tráfico · Engagement · Performance por categoría</p>
    </div>
  )

  if (noData) {
    return (
      <div className="space-y-8">
        {header}
        <Card>
          <div className="text-center py-12">
            <p className="text-2xl font-black text-gray-200 mb-2">—</p>
            <p className="text-sm font-semibold text-gray-500">Sin datos de analytics aún</p>
            <p className="text-[11px] text-gray-400 mt-1">
              Los clicks se registran automáticamente cuando los usuarios interactúan con el catálogo
            </p>
            <div className="flex items-center justify-center gap-4 mt-4">
              <p className="text-[10px] text-gray-400">{summary.catalogSize} productos en catálogo</p>
              {obs.meta.uptimeSince && (
                <p className="text-[10px] text-gray-400">Sistema activo: {relativeTime(obs.meta.uptimeSince)}</p>
              )}
            </div>
          </div>
        </Card>
        <div className="border-t border-gray-100 pt-4 pb-4">
          <p className="text-[10px] text-gray-300">
            <code className="font-mono">GET /api/analytics/summary</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {header}

      {/* ── Key metrics ─────────────────────────────────────────────────── */}
      <section>
        <SectionHeader>Métricas de tráfico — {summary.totalEvents} eventos</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total de eventos" value={summary.totalEvents} accent />
          <StatCard label="Productos con clicks" value={summary.uniqueProductsClicked} accent={summary.uniqueProductsClicked > 0} />
          {/* UX-3: solo mostrar dead si > 0 */}
          <StatCard label="Sin clicks (dead)" value={summary.productsWithZeroClicks} warn={summary.productsWithZeroClicks > 0} hideIfZero />
          <StatCard label="Tasa de productos muertos" value={summary.deadProductRate} warn={deadProductRateNum > 30} accent={deadProductRateNum === 0} hideIfZero={deadProductRateNum === 0} />
        </div>
      </section>

      {/* ── Top insights (guarda redundante eliminada — noData ya gatekeado arriba) */}
      <section>
        <SectionHeader>Insights clave</SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {insights.topPerformer && (
              <Card>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Top performer</p>
                <p className="text-sm font-semibold text-gray-800 line-clamp-2">{insights.topPerformer.title}</p>
                <p className="text-[10px] font-mono text-gray-400 mt-1">{insights.topPerformer.asin}</p>
                <p className="text-[11px] text-green-600 font-bold mt-2">{insights.topPerformer.clicks} clicks</p>
              </Card>
            )}
            {insights.mostActiveCategory && (
              <Card>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Categoría más activa</p>
                <p className="text-sm font-semibold text-gray-800 capitalize">{insights.mostActiveCategory}</p>
                {catalog.byCategory[insights.mostActiveCategory] && (
                  <>
                    <p className="text-[11px] text-blue-600 font-bold mt-2">
                      {catalog.byCategory[insights.mostActiveCategory]!.totalClicks} clicks
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {catalog.byCategory[insights.mostActiveCategory]!.productsWithClicks} productos activos
                    </p>
                  </>
                )}
              </Card>
            )}
            {insights.leastActiveCategory && (
              <Card>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Categoría menos activa</p>
                <p className="text-sm font-semibold text-gray-800 capitalize">{insights.leastActiveCategory}</p>
                {catalog.byCategory[insights.leastActiveCategory] && (
                  <p className="text-[10px] text-gray-400 mt-2">
                    {catalog.byCategory[insights.leastActiveCategory]!.totalProducts} productos en catálogo
                  </p>
                )}
              </Card>
            )}
          </div>
      </section>

      {/* ── Top products ────────────────────────────────────────────────── */}
      <section>
        <SectionHeader>Top productos — {topProducts.length} con mayor engagement</SectionHeader>
        {topProducts.length === 0 ? (
          <Card>
            <div className="text-center py-10">
              <p className="text-sm font-medium text-gray-500">Sin datos de clicks registrados aún</p>
              <p className="text-xs text-gray-400 mt-1">Los clicks se registran automáticamente cuando los usuarios interactúan con el catálogo</p>
            </div>
          </Card>
        ) : (
          <Card>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <Th>#</Th><Th>Producto</Th><Th>Categoría</Th><Th>Clicks</Th><Th>ClickShare</Th><Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={p.productId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <Td muted>{i + 1}</Td>
                    <Td>
                      <span className="font-medium line-clamp-1 block max-w-[200px]">{p.title}</span>
                      <span className="text-[9px] font-mono text-gray-400">{p.asin}</span>
                      {p.brand && <span className="text-[9px] text-blue-500 font-medium ml-1 uppercase">{p.brand}</span>}
                    </Td>
                    <Td muted><span className="capitalize">{p.category}</span></Td>
                    <Td>
                      <span className="font-bold text-gray-800">{p.clicks}</span>
                    </Td>
                    <Td>
                      <span className="text-[11px] tabular-nums text-gray-600">{p.clickShare}</span>
                    </Td>
                    <Td>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        p.catalogStatus === 'active'     ? 'bg-green-100 text-green-700' :
                        p.catalogStatus === 'suppressed' ? 'bg-red-100 text-red-600' :
                        'bg-gray-100 text-gray-500'
                      }`}>{p.catalogStatus}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* ── Category performance ─────────────────────────────────────────── */}
      <section>
        <SectionHeader>Performance por categoría</SectionHeader>
        {topCategories.length === 0 ? (
          <Card><p className="text-center text-sm text-gray-400 py-6">Sin datos de categorías aún.</p></Card>
        ) : (
          <Card>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <Th>Categoría</Th><Th>Productos</Th><Th>Con clicks</Th><Th>Total clicks</Th><Th>Avg clicks / producto</Th>
                </tr>
              </thead>
              <tbody>
                {topCategories.map(cat => {
                  const catMetric = catalog.byCategory[cat.category]
                  const withClicks = catMetric?.productsWithClicks ?? 0
                  const totalProds = catMetric?.totalProducts ?? 0
                  const avgClicks  = catMetric?.avgClicksPerProduct ?? '0'
                  const pctActive  = totalProds > 0 ? Math.round((withClicks / totalProds) * 100) : 0
                  return (
                    <tr key={cat.category} className="border-b border-gray-50 last:border-0">
                      <Td><span className="font-medium capitalize">{cat.category}</span></Td>
                      <Td muted>{totalProds}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${pctActive >= 50 ? 'text-green-600' : pctActive > 0 ? 'text-yellow-600' : 'text-gray-300'}`}>
                            {withClicks}
                          </span>
                          <span className="text-[10px] text-gray-400">({pctActive}%)</span>
                        </div>
                      </Td>
                      <Td><span className="font-bold text-gray-800">{cat.views}</span></Td>
                      <Td muted>{avgClicks}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* ── Dead products ───────────────────────────────────────────────── */}
      {catalog.deadProducts.length > 0 && (
        <section>
          <SectionHeader>Productos sin tráfico — {catalog.deadProducts.length} sin clicks</SectionHeader>
          <Card>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Productos activos en catálogo con 0 clicks registrados
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {catalog.deadProducts.slice(0, 12).map(p => (
                <div key={p.productId} className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-[11px] text-gray-700 font-medium line-clamp-1">{p.title}</p>
                  <p className="text-[9px] font-mono text-gray-400 mt-0.5">{p.asin}</p>
                  <p className="text-[10px] text-gray-400 capitalize mt-0.5">{p.category}</p>
                </div>
              ))}
              {catalog.deadProducts.length > 12 && (
                <div className="bg-gray-50 rounded-lg p-2.5 flex items-center justify-center">
                  <p className="text-xs text-gray-400">+{catalog.deadProducts.length - 12} más</p>
                </div>
              )}
            </div>
          </Card>
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4 pb-4 flex items-center justify-between">
        <p className="text-[10px] text-gray-300">
          <code className="font-mono">GET /api/analytics/summary</code>
          {' · '}<code className="font-mono">POST /api/analytics/reset</code>
        </p>
        {obs.meta.uptimeSince && (
          <p className="text-[10px] text-gray-300">
            Sistema activo desde {relativeTime(obs.meta.uptimeSince)} · {summary.catalogSize} productos
          </p>
        )}
      </div>
    </div>
  )
}
