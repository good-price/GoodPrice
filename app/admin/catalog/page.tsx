/**
 * app/admin/catalog/page.tsx — Catálogo
 *
 * Gestión del inventario organizada en 3 tabs:
 *   Integridad   — estado de validación + integrity score + confiabilidad
 *   Inteligencia — lifecycle + top productos + salud por categoría + supresión
 *   Consola      — tabla operativa completa (CatalogTable)
 *
 * Server Component — data fetched at render time.
 */

import type { Metadata }                    from 'next'
import { buildObservabilityReport, buildCatalogMetrics } from '@/lib/analytics'
import { runCatalogIntegrity, getLastIntegritySnapshot } from '@/lib/catalog/integrity'
import { generateIntelligenceReport }       from '@/lib/catalog/intelligence'
import { getPublicCatalogStats }            from '@/lib/catalog/public'
import { getLinkHealthStatus }              from '@/lib/catalog/link-health'
import { getCatalogStats }                  from '@/data/catalog'
import { getValidationCacheSize }           from '@/lib/catalog'
import { buildCatalogTableRows }            from '@/lib/ops/actions'
import type { ProductLifecycleState }       from '@/lib/catalog/intelligence'
import { CatalogTable }                     from '@/components/ops/CatalogTable'
import { AdminTabs }                        from '@/components/admin/AdminTabs'
import { SectionHeader, Card, StatCard, Th, Td, ScoreBar } from '@/components/admin/shared'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Catálogo — GOODPRICE Internal' }

// ── Static metadata ───────────────────────────────────────────────────────────

const LIFECYCLE_META: Record<ProductLifecycleState, { label: string; color: string; dot: string }> = {
  trending:    { label: 'Trending',   color: 'text-green-600',  dot: 'bg-green-500' },
  healthy:     { label: 'Healthy',    color: 'text-cyan-600',   dot: 'bg-cyan-500' },
  new:         { label: 'New',        color: 'text-blue-500',   dot: 'bg-blue-400' },
  stable:      { label: 'Stable',     color: 'text-gray-600',   dot: 'bg-gray-400' },
  declining:   { label: 'Declining',  color: 'text-yellow-600', dot: 'bg-yellow-400' },
  stale:       { label: 'Stale',      color: 'text-orange-500', dot: 'bg-orange-400' },
  unhealthy:   { label: 'Unhealthy',  color: 'text-red-500',    dot: 'bg-red-500' },
  quarantined: { label: 'Cuarentena', color: 'text-purple-600', dot: 'bg-purple-500' },
  archived:    { label: 'Archivado',  color: 'text-gray-300',   dot: 'bg-gray-300' },
}

const SUPPRESSION_SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-100 text-yellow-700',
}

const lifecycleOrder: ProductLifecycleState[] = [
  'trending', 'healthy', 'new', 'stable',
  'declining', 'stale', 'unhealthy', 'quarantined', 'archived',
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function CatalogPage() {
  const [obs, catalog] = await Promise.all([buildObservabilityReport(), buildCatalogMetrics()])
  const catalogStats       = getCatalogStats()
  const cacheSize          = getValidationCacheSize()
  const integrityReport    = runCatalogIntegrity()
  const lastSnapshot       = getLastIntegritySnapshot()
  const prevScore          = lastSnapshot ? lastSnapshot.score : null
  const reliabilityStats   = getPublicCatalogStats()
  const intelligenceReport = await generateIntelligenceReport({ analyticsData: catalog, includeDiscovery: true })
  const catalogTableRows   = buildCatalogTableRows()

  const linkHealthStatus = getLinkHealthStatus()
  const deadProductIdSet = new Set(catalog.deadProducts.map(p => p.productId))
  const enrichedRows     = catalogTableRows.map(r => ({
    ...r,
    clickCount: obs.summary.totalEvents === 0 ? -1 : deadProductIdSet.has(r.productId) ? 0 : 1,
  }))

  const lifecycleCounts = Object.values(intelligenceReport.lifecycleStates).reduce(
    (acc, s) => { acc[s] = (acc[s] ?? 0) + 1; return acc },
    {} as Record<ProductLifecycleState, number>,
  )

  const suppCritical = intelligenceReport.suppressionQueue.filter(s => s.severity === 'critical')
  const suppHigh     = intelligenceReport.suppressionQueue.filter(s => s.severity === 'high')

  const integrityScoreColor =
    integrityReport.score >= 90 ? 'text-green-600' :
    integrityReport.score >= 75 ? 'text-cyan-600' :
    integrityReport.score >= 60 ? 'text-yellow-500' :
    integrityReport.score >= 40 ? 'text-orange-500' : 'text-red-500'

  const integrityIssues = integrityReport.issues.filter(i => i.severity !== 'info')

  const tabs = [
    {
      id:    'integrity',
      label: 'Integridad',
      count: integrityIssues.length > 0 ? integrityIssues.length : undefined,
      warn:  integrityIssues.length > 0,
    },
    {
      id:    'intelligence',
      label: 'Inteligencia',
      count: intelligenceReport.suppressionQueue.length > 0
        ? intelligenceReport.suppressionQueue.length : undefined,
      warn: suppCritical.length > 0,
    },
    {
      id:    'console',
      label: 'Consola',
      count: enrichedRows.length,
    },
  ]

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 pb-5">
        <h1 className="text-base font-bold text-gray-900">Catálogo</h1>
        <p className="text-xs text-gray-400 mt-1">
          Integridad · Inteligencia · Consola de operaciones
        </p>
      </div>

      {/* ── Gate 9 warning — shown only when link health has never been audited ── */}
      {!linkHealthStatus.hasData && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-orange-200 bg-orange-50">
          <span className="text-orange-500 text-base flex-shrink-0 mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-orange-800">
              Gate 9 sin calibrar — enlaces Amazon no auditados
            </p>
            <p className="text-[10px] text-orange-600 mt-0.5">
              El cache de link health no existe. Productos con páginas Amazon en 404
              podrían estar visibles al público. Gate 9 solo suprime enlaces confirmados
              muertos — sin datos, no suprime nada.
            </p>
            <p className="text-[10px] text-orange-500 mt-1 font-mono">
              Ejecutar:{' '}
              <span className="bg-orange-100 px-1.5 py-0.5 rounded">
                POST /api/catalog/link-audit/run
              </span>
            </p>
          </div>
          <span className="text-[10px] text-orange-400 flex-shrink-0 font-medium whitespace-nowrap">
            Gate 9
          </span>
        </div>
      )}

      {/* ── Tabbed content ───────────────────────────────────────────────── */}
      <AdminTabs tabs={tabs} defaultTab="integrity">

        {/* ── Tab: Integridad ────────────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Validation status */}
          <section>
            <SectionHeader>Estado de validación</SectionHeader>
            <Card>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {[
                  { label: 'Activos',        count: catalogStats.active,     cls: 'text-green-600' },
                  { label: 'Inactivos',      count: catalogStats.inactive,   cls: 'text-red-500' },
                  { label: 'No verificados', count: catalogStats.unverified, cls: 'text-yellow-600' },
                  { label: 'Stale (>30d)',   count: catalogStats.stale,      cls: 'text-gray-400' },
                  { label: 'Caché ASINs',    count: cacheSize,               cls: 'text-blue-500' },
                ].map(({ label, count, cls }) => (
                  <div key={label} className="text-center">
                    <p className={`text-2xl font-bold ${cls}`}>{count}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 font-medium uppercase tracking-wide">{label}</p>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          {/* Integrity score */}
          <section>
            <SectionHeader>
              Integridad — score {integrityReport.score} · Grade {integrityReport.grade}
            </SectionHeader>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <Card className="sm:col-span-1 flex flex-col justify-between">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Score global</p>
                <div className="flex items-center gap-3">
                  <span className={`text-4xl font-black tabular-nums ${integrityScoreColor}`}>
                    {integrityReport.score}
                  </span>
                  <div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      integrityReport.grade === 'A' ? 'bg-green-100 text-green-700' :
                      integrityReport.grade === 'B' ? 'bg-cyan-100 text-cyan-700' :
                      integrityReport.grade === 'C' ? 'bg-yellow-100 text-yellow-700' :
                      integrityReport.grade === 'D' ? 'bg-orange-100 text-orange-700' :
                      'bg-red-100 text-red-700'
                    }`}>{integrityReport.grade}</span>
                    <p className="text-[10px] text-gray-400 mt-0.5">/ 100</p>
                  </div>
                </div>
                {prevScore !== null && (
                  <p className={`text-xs font-semibold mt-2 ${
                    integrityReport.score > prevScore ? 'text-green-600' :
                    integrityReport.score < prevScore ? 'text-red-500' : 'text-gray-400'
                  }`}>
                    {integrityReport.score > prevScore
                      ? `↑ +${integrityReport.score - prevScore}`
                      : integrityReport.score < prevScore
                        ? `↓ ${integrityReport.score - prevScore}`
                        : '→ sin cambio'}
                    {' '}vs. último snapshot
                  </p>
                )}
              </Card>
              <Card className="sm:col-span-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Desglose del score</p>
                <div className="space-y-2.5">
                  {[
                    { label: 'Imágenes',     pts: integrityReport.scoreBreakdown.imageScore,     max: 25 },
                    { label: 'ASINs',        pts: integrityReport.scoreBreakdown.asinScore,      max: 25 },
                    { label: 'Auditoría',    pts: integrityReport.scoreBreakdown.auditScore,     max: 20 },
                    { label: 'Duplicados',   pts: integrityReport.scoreBreakdown.duplicateScore, max: 15 },
                    { label: 'Ocultamiento', pts: integrityReport.scoreBreakdown.hiddenScore,    max: 15 },
                  ].map(({ label, pts, max }) => (
                    <div key={label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-[11px] text-gray-600">{label}</span>
                        <span className="text-[11px] text-gray-500 tabular-nums">{pts}/{max}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${(pts/max) >= 0.8 ? 'bg-green-500' : (pts/max) >= 0.6 ? 'bg-yellow-400' : 'bg-red-500'}`}
                          style={{ width: `${Math.round((pts / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {integrityIssues.length > 0 && (
              <Card>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Issues detectados</p>
                <div className="space-y-2">
                  {integrityIssues.slice(0, 8).map((issue, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0 ${
                        issue.severity === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>{issue.severity}</span>
                      <p className="text-[11px] text-gray-700">{issue.message}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </section>

          {/* Reliability */}
          <section>
            <SectionHeader>Confiabilidad — visibilidad pública</SectionHeader>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Públicos" value={reliabilityStats.public} accent={reliabilityStats.public > 0} />
              <StatCard label="Ocultos (suprimidos)" value={reliabilityStats.hidden} warn={reliabilityStats.hidden > 0} accent={reliabilityStats.hidden === 0} />
              <StatCard label="Colombia bloqueado" value={reliabilityStats.colombiaBlocked} warn={reliabilityStats.colombiaBlocked > 0} />
              <StatCard label="Imágenes rotas" value={reliabilityStats.brokenImages} warn={reliabilityStats.brokenImages > 0} />
            </div>
          </section>
        </div>

        {/* ── Tab: Inteligencia ──────────────────────────────────────────── */}
        <div className="space-y-6">
          <section>
            <SectionHeader>Inteligencia — {intelligenceReport.totalProducts} productos</SectionHeader>

            {/* Lifecycle distribution */}
            <Card className="mb-4">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Distribución de estados de ciclo de vida
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {lifecycleOrder.map(state => {
                  const count = lifecycleCounts[state] ?? 0
                  const meta  = LIFECYCLE_META[state]
                  return (
                    <div key={state} className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        <p className={`text-[10px] font-semibold uppercase tracking-wide ${meta.color}`}>{meta.label}</p>
                      </div>
                      <p className={`text-xl font-bold ${count > 0 ? meta.color : 'text-gray-200'}`}>{count}</p>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* Top healthy + at risk */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <Card>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">✅ Top productos saludables</p>
                {intelligenceReport.topHealthy.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">Sin datos aún.</p>
                ) : (
                  <div className="space-y-1.5">
                    {intelligenceReport.topHealthy.slice(0, 5).map(h => (
                      <div key={h.productId} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-gray-400 w-6 text-right">{h.total}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${h.total}%` }} />
                        </div>
                        <span className="text-[11px] text-gray-700 line-clamp-1 max-w-[140px]">{h.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">⚠ Productos en riesgo</p>
                {intelligenceReport.atRisk.length === 0 ? (
                  <p className="text-xs text-green-600 font-medium py-2">Sin productos en riesgo.</p>
                ) : (
                  <div className="space-y-2">
                    {intelligenceReport.atRisk.slice(0, 5).map(p => (
                      <div key={p.productId}>
                        <p className="text-[11px] text-gray-700 line-clamp-1">{p.title}</p>
                        <p className="text-[9px] text-red-500 mt-0.5">{p.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Category health */}
            <Card className="mb-4">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Salud por categoría</p>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <Th>Categoría</Th><Th>Productos</Th><Th>Saludables</Th><Th>En riesgo</Th><Th>Score medio</Th><Th>Tendencia</Th>
                  </tr>
                </thead>
                <tbody>
                  {intelligenceReport.categoryHealth.slice(0, 10).map(cat => (
                    <tr key={cat.slug} className="border-b border-gray-50 last:border-0">
                      <Td><span className="font-medium capitalize">{cat.name}</span></Td>
                      <Td muted>{cat.totalProducts}</Td>
                      <Td><span className={cat.healthyCount > 0 ? 'text-green-600 font-semibold' : 'text-gray-300'}>{cat.healthyCount}</span></Td>
                      <Td><span className={cat.atRiskCount > 0 ? 'text-red-500 font-semibold' : 'text-gray-300'}>{cat.atRiskCount}</span></Td>
                      <td className="py-2 pr-4"><ScoreBar score={cat.avgHealthScore} /></td>
                      <td className="py-2 pr-4">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          cat.trend === 'rising'  ? 'bg-green-100 text-green-700' :
                          cat.trend === 'falling' ? 'bg-red-100 text-red-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {cat.trend === 'rising' ? '↑ alza' : cat.trend === 'falling' ? '↓ baja' : '→ estable'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Suppression queue */}
            {intelligenceReport.suppressionQueue.length > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    Cola de supresión — {intelligenceReport.suppressionQueue.length} productos
                  </p>
                  <div className="flex gap-2">
                    {suppCritical.length > 0 && <span className="text-[10px] font-bold text-red-600">{suppCritical.length} críticos</span>}
                    {suppHigh.length > 0 && <span className="text-[10px] font-bold text-orange-600">{suppHigh.length} altos</span>}
                  </div>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <Th>Producto</Th><Th>Categoría</Th><Th>Health</Th><Th>Razón</Th><Th>Severidad</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {intelligenceReport.suppressionQueue.slice(0, 8).map(s => (
                      <tr key={s.productId} className="border-b border-gray-50 last:border-0">
                        <Td>
                          <span className="line-clamp-1 max-w-[160px] block text-[11px]">{s.title}</span>
                          <span className="text-[9px] text-gray-400 font-mono">{s.asin}</span>
                        </Td>
                        <Td muted>{s.category}</Td>
                        <Td><span className={s.healthScore < 30 ? 'text-red-500 font-bold' : 'text-gray-600'}>{s.healthScore}</span></Td>
                        <Td><span className="text-[10px] text-gray-600">{s.reason}</span></Td>
                        <td className="py-2 pr-4">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${SUPPRESSION_SEVERITY_COLOR[s.severity] ?? 'bg-gray-100 text-gray-500'}`}>
                            {s.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </section>
        </div>

        {/* ── Tab: Consola ───────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total" value={enrichedRows.length} />
            <StatCard label="Suprimidos" value={enrichedRows.filter(r => r.tier === 'suppressed').length} warn={enrichedRows.filter(r => r.tier === 'suppressed').length > 0} />
            <StatCard label="Con override" value={enrichedRows.filter(r => r.hasOverride).length} accent={enrichedRows.filter(r => r.hasOverride).length > 0} />
            <StatCard label="En riesgo / Pendiente" value={`${enrichedRows.filter(r => r.riskLevel !== null).length} / ${enrichedRows.filter(r => r.pendingAction !== null).length}`} />
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <CatalogTable initialRows={enrichedRows} />
          </div>
        </div>

      </AdminTabs>
    </div>
  )
}
