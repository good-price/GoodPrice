/**
 * app/admin/catalog/page.tsx — Catalog Center
 *
 * Centro de gestión del catálogo runtime GOODPRICE OPS V3.
 *
 * 16 zonas:
 *   1. Health              — métricas generales (versión, activos, CO, categorías)
 *   2. Categories          — tabla editable: Categoría / Actual / Mínimo + Guardar
 *   3. Execution           — estado del último pipeline Auto Fill (lectura)
 *   4. History             — últimos eventos catalog-fill / manual-action
 *   5. Discovery Engine    — último run catalog-discovery (lectura)
 *   6. Discovery Operations — tabla por categoría: última ej, estado, métricas, tasas
 *   7. Discovery Actions   — formulario de ejecución manual de Discovery
 *   8. Discovery Governance — salud del pool por categoría
 *   9. Catalog Lifecycle   — salud del ciclo de vida: healthy/aging/stale/critical
 *  10. Lifecycle Products  — 20 productos más deteriorados
 *  11. Pricing Memory      — gobernanza de precios: tendencias, volatilidad, oportunidades
 *  12. Pricing Products    — top 20 productos por oportunidad de precio
 *  13. Recommendation Governance — distribución de scores de recomendación
 *  14. Recommendation Products   — top 20 por recommendationScore
 *  15. Alert Governance          — distribución de alertas por severidad
 *  16. Alert Products            — 20 alertas activas más recientes
 *
 * Todo Server Components. force-dynamic.
 * Feedback de guardado vía ?status= / discovery via ?discovery= query params.
 */

import type { Metadata } from 'next'
import Link              from 'next/link'

import { readRuntimeCatalog, getRuntimeCatalogStats, computeCategoryDeficits } from '@/lib/catalog/runtime'
import { getCatalogSource }          from '@/lib/catalog/source'
import { readCatalogExecutionState } from '@/lib/catalog/runtime/execution'
import { readLatestLogs, getLastLogByJobType } from '@/lib/ops/logs'
import { getCandidatePoolStats }     from '@/lib/catalog/discovery/pool-health'
import { readDiscoveryState }        from '@/lib/catalog/discovery/state'
import { readDiscoveryMetrics }      from '@/lib/catalog/discovery/metrics'
import { getPoolGovernance }         from '@/lib/catalog/discovery/governance'
import { getLifecycleGovernance }    from '@/lib/catalog/lifecycle/governance'
import { readLifecycleStore }        from '@/lib/catalog/lifecycle/state'
import { getPricingGovernance }          from '@/lib/catalog/pricing-memory/governance'
import { readProductIntelligence }       from '@/lib/catalog/pricing-memory/state'
import { getRecommendationGovernance }   from '@/lib/catalog/recommendations/governance'
import { readRecommendations }           from '@/lib/catalog/recommendations/state'
import { getAlertGovernance }            from '@/lib/catalog/alerts/governance'
import { readAlerts }                    from '@/lib/catalog/alerts/state'

import { CatalogHealth }       from '@/components/admin/catalog/CatalogHealth'
import { CategoryTable }       from '@/components/admin/catalog/CategoryTable'
import { CatalogExecution }    from '@/components/admin/catalog/CatalogExecution'
import { CatalogHistory }      from '@/components/admin/catalog/CatalogHistory'
import { DiscoveryEngine }     from '@/components/admin/catalog/DiscoveryEngine'
import { DiscoveryOperations } from '@/components/admin/catalog/DiscoveryOperations'
import { DiscoveryActions }    from '@/components/admin/catalog/DiscoveryActions'
import { DiscoveryGovernance } from '@/components/admin/catalog/DiscoveryGovernance'
import { CatalogLifecycle }   from '@/components/admin/catalog/CatalogLifecycle'
import { LifecycleProducts }  from '@/components/admin/catalog/LifecycleProducts'
import { PricingGovernance }          from '@/components/admin/catalog/PricingGovernance'
import { PricingProducts }            from '@/components/admin/catalog/PricingProducts'
import { RecommendationGovernance }   from '@/components/admin/catalog/RecommendationGovernance'
import { RecommendationProducts }     from '@/components/admin/catalog/RecommendationProducts'
import { AlertGovernance }            from '@/components/admin/catalog/AlertGovernance'
import { AlertProducts }              from '@/components/admin/catalog/AlertProducts'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Catalog Center — GOODPRICE Internal' }

interface PageProps {
  searchParams: { status?: string; discovery?: string }
}

export default function CatalogCenterPage({ searchParams }: PageProps) {
  // ── Data reads ───────────────────────────────────────────────────────────────
  const store     = readRuntimeCatalog()
  const stats     = getRuntimeCatalogStats()
  const deficits  = computeCategoryDeficits()
  const source    = getCatalogSource()
  const execution = readCatalogExecutionState()
  const allLogs   = readLatestLogs(50)
  const poolStats       = getCandidatePoolStats()
  const lastDiscovery   = getLastLogByJobType('catalog-discovery')
  const discoveryState  = readDiscoveryState()
  const discoveryMetrics   = readDiscoveryMetrics()
  const poolGovernance     = getPoolGovernance()
  const lifecycleGovernance = getLifecycleGovernance()
  const lifecycleStore     = readLifecycleStore()
  const lifecycleProducts  = Object.values(lifecycleStore.products)
  const pricingGovernance        = getPricingGovernance()
  const intelligenceStore        = readProductIntelligence()
  const pricingProducts          = Object.values(intelligenceStore.products)
  const recommendationGovernance = getRecommendationGovernance()
  const recommendationStore      = readRecommendations()
  const recommendationProducts   = Object.values(recommendationStore.products)
  const alertGovernance          = getAlertGovernance()
  const alertStore               = readAlerts()
  const alertProducts            = Object.values(alertStore.alerts)

  // Zona 4: catalog-fill and manual-action logs
  const catalogLogs = allLogs.filter(
    l => l.jobType === 'catalog-fill' || l.jobType === 'manual-action',
  )

  // Status feedback from Server Action redirects
  const saveStatus      = searchParams?.status    ?? null
  const discoveryStatus = searchParams?.discovery ?? null

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-gray-200">
        <div>
          <h1 className="text-base font-bold text-gray-900">
            <span className="text-[#F7A823]">GOOD</span>PRICE
            <span className="text-gray-300 font-light mx-2">/</span>
            <span className="text-gray-500 font-normal">Catalog Center</span>
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            v{store.version} · {store.totalProducts} productos
          </p>
        </div>
        <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-400 border border-gray-200">
          🔒 INTERNAL
        </span>
      </div>

      {/* Save status banner */}
      {saveStatus === 'saved' && (
        <div className="mt-4 px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-[12px] font-medium text-green-700">
          Configuración guardada.
        </div>
      )}
      {saveStatus === 'unchanged' && (
        <div className="mt-4 px-4 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-[12px] font-medium text-gray-500">
          Sin cambios.
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="mt-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-[12px] font-medium text-red-600">
          Error al guardar. Intenta de nuevo.
        </div>
      )}

      {/* Zonas */}
      <div className="divide-y divide-gray-100">

        {/* Zona 1: Health */}
        <div className="py-6">
          <CatalogHealth stats={stats} source={source} deficits={deficits} poolStats={poolStats} />
        </div>

        {/* Zona 2: Categories */}
        <div className="py-6">
          <CategoryTable deficits={deficits} />
        </div>

        {/* Zona 3: Execution */}
        <div className="py-6">
          <CatalogExecution execution={execution} />
        </div>

        {/* Zona 4: History */}
        <div className="py-6">
          <CatalogHistory logs={catalogLogs} />
        </div>

        {/* Zona 5: Discovery Engine */}
        <div className="py-6">
          <DiscoveryEngine lastRun={lastDiscovery} />
        </div>

        {/* Zona 6: Discovery Operations */}
        <div className="py-6">
          <DiscoveryOperations discoveryState={discoveryState} discoveryMetrics={discoveryMetrics} />
        </div>

        {/* Zona 7: Discovery Actions */}
        <div className="py-6">
          <DiscoveryActions discoveryStatus={discoveryStatus} />
        </div>

        {/* Zona 8: Discovery Governance */}
        <div className="py-6">
          <DiscoveryGovernance governance={poolGovernance} />
        </div>

        {/* Zona 9: Catalog Lifecycle */}
        <div className="py-6">
          <CatalogLifecycle governance={lifecycleGovernance} />
        </div>

        {/* Zona 10: Lifecycle Products */}
        <div className="py-6">
          <LifecycleProducts products={lifecycleProducts} />
        </div>

        {/* Zona 11: Pricing Memory Governance */}
        <div className="py-6">
          <PricingGovernance governance={pricingGovernance} />
        </div>

        {/* Zona 12: Pricing Products */}
        <div className="py-6">
          <PricingProducts products={pricingProducts} />
        </div>

        {/* Zona 13: Recommendation Governance */}
        <div className="py-6">
          <RecommendationGovernance governance={recommendationGovernance} />
        </div>

        {/* Zona 14: Recommendation Products */}
        <div className="py-6">
          <RecommendationProducts products={recommendationProducts} />
        </div>

        {/* Zona 15: Alert Governance */}
        <div className="py-6">
          <AlertGovernance governance={alertGovernance} />
        </div>

        {/* Zona 16: Alert Products */}
        <div className="py-6">
          <AlertProducts alerts={alertProducts} />
        </div>

      </div>

      {/* Links contextuales */}
      <div className="pt-6 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1">
        <Link href="/admin"            className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">Nerve Center →</Link>
        <Link href="/admin/automation" className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">Automation Center →</Link>
        <Link href="/admin/activity"   className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">Activity Center →</Link>
        <Link href="/admin/system"     className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">System Center →</Link>
      </div>

    </div>
  )
}
