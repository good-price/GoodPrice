/**
 * components/admin/catalog/CatalogHealth.tsx
 *
 * Catalog Center — Zona 1: CATALOG HEALTH
 *
 * Métricas generales del catálogo runtime:
 *   - Source activo (runtime / legacy)
 *   - Total, activos, inactivos, no verificados, stale, confirmados CO
 *   - Categorías cumpliendo mínimo / bajo mínimo
 *   - Versión y timestamp
 *
 * Server Component.
 */

import type { RuntimeCatalogStats, CategoryDeficit } from '@/lib/catalog/runtime'
import type { CatalogSource } from '@/lib/catalog/source'
import type { CandidatePoolStats } from '@/lib/catalog/discovery/pool-health'
import { Card, StatCard, SectionHeader, relativeTime, fmtDate } from '@/components/admin/shared'

interface Props {
  stats:      RuntimeCatalogStats
  source:     CatalogSource
  deficits:   CategoryDeficit[]
  poolStats?: CandidatePoolStats
}

export function CatalogHealth({ stats, source, deficits, poolStats }: Props) {
  const sourceOk   = source === 'runtime'
  const meeting    = deficits.filter(d => d.deficit === 0).length
  const belowMin   = deficits.filter(d => d.deficit > 0).length

  return (
    <section>
      <SectionHeader>Catalog Health</SectionHeader>

      {/* Source indicator */}
      <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-lg border text-[11px] font-medium ${
        sourceOk
          ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-yellow-50 border-yellow-200 text-yellow-700'
      }`}>
        <span>{sourceOk ? '●' : '○'}</span>
        <span>
          {sourceOk
            ? 'Sirviendo desde runtime-catalog.json'
            : 'Sirviendo desde legacy (catálogo estático)'}
        </span>
        <span className="ml-auto font-mono text-[10px] opacity-60">{source}</span>
      </div>

      {/* Product stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Total productos"  value={stats.totalProducts}    info />
        <StatCard label="Activos"          value={stats.activeProducts}   accent={stats.activeProducts > 0} />
        <StatCard label="Confirmados CO"   value={stats.colombiaConfirmed} info />
        <StatCard label="Inactivos"        value={stats.inactiveProducts} warn={stats.inactiveProducts > 0} hideIfZero />
        <StatCard label="No verificados"   value={stats.unverifiedProducts} warn={stats.unverifiedProducts > 0} hideIfZero />
        <StatCard label="Stale (>30d)"     value={stats.staleProducts}    warn={stats.staleProducts > 0} hideIfZero />
      </div>

      {/* Category coverage */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="Categorías cumpliendo" value={meeting}   accent={meeting > 0} />
        <StatCard label="Bajo mínimo"           value={belowMin}  warn={belowMin > 0}  />
      </div>

      {/* Pool candidates (Sprint 3H) */}
      {poolStats && poolStats.totalCandidates > 0 && (
        <Card>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Pool de Candidatos
          </p>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-gray-500">Candidatos netos</span>
            <span className="text-[13px] font-bold text-gray-700 tabular-nums">
              {poolStats.totalCandidates}
            </span>
          </div>
          <div className="space-y-1">
            {Object.entries(poolStats.byCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, count]) => {
                const isEmpty = count === 0
                const isLow   = count > 0 && count < 5
                return (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 capitalize">{cat}</span>
                    <span className={`text-[10px] font-mono font-semibold tabular-nums ${
                      isEmpty ? 'text-red-500' : isLow ? 'text-orange-500' : 'text-gray-600'
                    }`}>
                      {count}
                    </span>
                  </div>
                )
              })}
          </div>
          {poolStats.emptyCategories.length > 0 && (
            <p className="mt-2 text-[10px] text-red-500">
              Sin candidatos: {poolStats.emptyCategories.join(', ')}
            </p>
          )}
        </Card>
      )}

      {/* Version + timestamp */}
      <Card>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Versión</p>
            <p className="text-lg font-bold text-gray-700 mt-0.5 tabular-nums">v{stats.version}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Última actualización</p>
            <p className="text-[12px] text-gray-700 mt-0.5">
              {stats.updatedAt ? relativeTime(stats.updatedAt) : '—'}
            </p>
            {stats.updatedAt && (
              <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(stats.updatedAt)}</p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Cobertura CO</p>
            <p className="text-lg font-bold text-gray-700 mt-0.5 tabular-nums">
              {stats.totalProducts > 0
                ? `${Math.round((stats.colombiaConfirmed / stats.totalProducts) * 100)}%`
                : '—'}
            </p>
          </div>
        </div>
      </Card>
    </section>
  )
}
