/**
 * components/admin/TrustComponents.tsx
 *
 * Trust tier visibility, suppression breakdown, and self-healing section.
 * Used in /admin/audit and /admin/ops.
 */

import type { TrustReport }       from '@/lib/catalog/trust/types'
import type { SelfHealingReport } from '@/lib/catalog/self-healing'
import { SectionHeader, Card, StatCard, Th, Td, relativeTime } from './shared'

// ── TrustSection ──────────────────────────────────────────────────────────────

export function TrustSection({ report }: { report: TrustReport }) {
  const visiblePct = report.totalProducts > 0
    ? Math.round((report.visible / report.totalProducts) * 100) : 0

  const suppressionEntries = Object.entries(report.suppressionBreakdown).sort((a, b) => b[1] - a[1])
  const badgeEntries       = Object.entries(report.warningBreakdown ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))

  const badgeLabels: Record<string, string> = {
    IMG_QUALITY: 'Imagen pendiente', AVAILABILITY_CHECK: 'Validando disponibilidad',
    COLOMBIA_IMPORT: 'Importación limitada', PRICE_UPDATE: 'Precio en actualización',
    PARTIAL_INFO: 'Información parcialmente verificada',
  }
  const suppressionLabels: Record<string, string> = {
    inactive_status: 'Estado inactivo', colombia_restriction: 'Restricción Colombia',
    quarantine: 'Cuarentena', invalid_asin: 'ASIN inválido', invalid_image_url: 'URL de imagen inválida',
    dead_asin_image: 'ASIN imagen muerta', consecutive_audit_failures: 'Fallos de auditoría consecutivos',
    intelligence_critical: 'Supresión intelligence CRITICAL', dead_amazon_link: 'Enlace Amazon muerto',
    healing_suppression: 'Self-healing (Gate 11)', other: 'Otros',
  }

  return (
    <section>
      <SectionHeader>
        Trust Tier — {report.visible}/{report.totalProducts} visibles ({visiblePct}%) · score promedio {report.avgPublicScore}/100
      </SectionHeader>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="ACTIVE — sin issues" value={report.active} accent={report.active > 0} />
        <StatCard label="WARNING — visibles" value={report.warning} />
        <StatCard label="DEGRADED — visibles" value={report.degraded} warn={report.degraded > 30} />
        <StatCard label="SUPPRESSED — ocultos" value={report.suppressed} warn={report.suppressed > 0} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card>
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Visibilidad pública</p>
          <div className="flex items-end gap-2 mt-1">
            <span className="text-2xl font-bold text-gray-900">{visiblePct}%</span>
            <span className="text-xs text-gray-400 mb-1">({report.visible} / {report.totalProducts})</span>
          </div>
          <div className="mt-2 bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className={`h-2 rounded-full ${visiblePct >= 60 ? 'bg-green-500' : visiblePct >= 30 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${visiblePct}%` }} />
          </div>
        </Card>
        <Card>
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Score confianza promedio</p>
          <div className="flex items-end gap-2 mt-1">
            <span className={`text-2xl font-bold ${report.avgPublicScore >= 70 ? 'text-green-600' : report.avgPublicScore >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>{report.avgPublicScore}</span>
            <span className="text-xs text-gray-400 mb-1">/ 100</span>
          </div>
          <div className="mt-2 bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className={`h-2 rounded-full ${report.avgPublicScore >= 70 ? 'bg-green-500' : report.avgPublicScore >= 50 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${report.avgPublicScore}%` }} />
          </div>
        </Card>
        <Card>
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Candidatos a recuperar</p>
          <p className={`text-2xl font-bold mt-1 ${report.recoveryCandidates > 0 ? 'text-blue-600' : 'text-gray-300'}`}>{report.recoveryCandidates}</p>
          <p className="text-[10px] text-gray-400 mt-1">{report.recoveryCandidates > 0 ? 'Re-auditoría podría recuperarlos' : 'Sin candidatos recuperables'}</p>
        </Card>
      </div>

      {suppressionEntries.length > 0 && (
        <Card className="mb-4">
          <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">⛔ Razones de supresión ({report.suppressed} productos)</p>
          <div className="space-y-1.5">
            {suppressionEntries.map(([key, count]) => {
              const pct = report.suppressed > 0 ? Math.round((count / report.suppressed) * 100) : 0
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-600 w-52 flex-shrink-0">{suppressionLabels[key] ?? key}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] tabular-nums text-gray-500 w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {badgeEntries.length > 0 && (
        <Card className="mb-4">
          <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">⚠️ Badges de advertencia ({report.warning + report.degraded} productos)</p>
          <div className="space-y-1.5">
            {badgeEntries.map(([code, count]) => {
              const total = report.warning + report.degraded
              const pct = total > 0 ? Math.round(((count ?? 0) / total) * 100) : 0
              return (
                <div key={code} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-600 w-52 flex-shrink-0">{badgeLabels[code] ?? code}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-yellow-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] tabular-nums text-gray-500 w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <p className="text-[10px] text-gray-300 leading-relaxed mt-1">
        Calculado {relativeTime(report.computedAt)} · Forzar recálculo:{' '}
        <code className="font-mono">POST /api/catalog/trust/recompute</code>
      </p>
    </section>
  )
}

// ── SelfHealingSection ────────────────────────────────────────────────────────

export function SelfHealingSection({ report }: { report: SelfHealingReport | null }) {
  if (!report) {
    return (
      <section>
        <SectionHeader>Self-Healing — Catálogo autónomo</SectionHeader>
        <Card>
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400 mb-2">Ningún ciclo de auto-reparación ejecutado aún.</p>
            <p className="text-xs text-gray-300 font-mono">POST /api/catalog/self-healing/run</p>
          </div>
        </Card>
      </section>
    )
  }

  const hasArchived     = report.newlySuppressed.length > 0
  const hasRecovered    = report.newlyRecovered.length > 0
  const hasRepairs      = report.driftRepairs.length > 0
  const hasReplacements = report.replacements.length > 0

  return (
    <section>
      <SectionHeader>Self-Healing — ciclo {report.cycleCount} · {relativeTime(report.lastCycleAt ?? '')}</SectionHeader>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="Auto-suprimidos activos" value={report.suppressedCount} warn={report.suppressedCount > 0} accent={report.suppressedCount === 0} />
        <StatCard label="Recuperados (total)" value={report.recoveredAllTime} accent={report.recoveredAllTime > 0} />
        <StatCard label="Correcciones drift" value={report.driftRepairsAllTime} accent={report.driftRepairsAllTime > 0} />
        <StatCard label="Productos stale" value={report.staleProducts.length} warn={report.staleProducts.length > 5} />
      </div>

      {hasArchived && (
        <Card className="mb-4 border-red-200 bg-red-50/30">
          <p className="text-xs font-semibold text-red-600 mb-3 uppercase tracking-wide">⛔ Suprimidos este ciclo ({report.newlySuppressed.length})</p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-red-100"><Th>ASIN</Th><Th>Score</Th><Th>Razón</Th><Th>Hora</Th></tr></thead>
              <tbody>
                {report.newlySuppressed.map(e => (
                  <tr key={e.productId} className="border-b border-red-50 last:border-0">
                    <Td mono>{e.asin}</Td>
                    <Td><span className="text-red-600 font-bold">{e.truthScore}/100</span></Td>
                    <Td><span className="text-[11px] text-gray-600 line-clamp-1 max-w-[280px] block">{e.reason}</span></Td>
                    <Td muted>{relativeTime(e.ts)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {hasRecovered && (
        <Card className="mb-4 border-green-200 bg-green-50/30">
          <p className="text-xs font-semibold text-green-700 mb-3 uppercase tracking-wide">✅ Recuperados este ciclo ({report.newlyRecovered.length})</p>
          <div className="flex flex-wrap gap-2">
            {report.newlyRecovered.map(e => (
              <div key={e.productId} className="bg-green-100 rounded-lg px-3 py-1.5 text-xs">
                <span className="font-mono text-green-800">{e.asin}</span>
                <span className="text-green-600 ml-2">{e.truthScore}/100</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {hasRepairs && (
        <Card className="mb-4 border-blue-100 bg-blue-50/20">
          <p className="text-xs font-semibold text-blue-600 mb-3 uppercase tracking-wide">🔧 Correcciones de drift aplicadas ({report.driftRepairs.length})</p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-blue-100"><Th>ASIN</Th><Th>Tipo</Th><Th>Valor anterior</Th><Th>Valor nuevo</Th><Th>Δ%</Th><Th>Confianza</Th></tr></thead>
              <tbody>
                {report.driftRepairs.slice(0, 8).map((r, i) => (
                  <tr key={i} className="border-b border-blue-50 last:border-0">
                    <Td mono>{r.asin}</Td>
                    <Td><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${r.type === 'price' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{r.type}</span></Td>
                    <Td muted>{r.type === 'price' ? `$${Number(r.oldValue).toFixed(2)}` : <span className="line-clamp-1 max-w-[120px] block text-[10px]">{String(r.oldValue)}</span>}</Td>
                    <Td>{r.type === 'price' ? `$${Number(r.newValue).toFixed(2)}` : <span className="line-clamp-1 max-w-[120px] block text-[10px]">{String(r.newValue)}</span>}</Td>
                    <Td>{r.deltaPct !== undefined ? <span className={r.deltaPct > 0 ? 'text-red-500' : 'text-green-600'}>{r.deltaPct > 0 ? '+' : ''}{r.deltaPct}%</span> : '—'}</Td>
                    <Td muted>{r.confidence}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {hasReplacements && (
        <Card className="mb-4">
          <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">🔄 Sugerencias de reemplazo ({report.replacements.length} productos)</p>
          <div className="space-y-3">
            {report.replacements.slice(0, 4).map(s => (
              <div key={s.failedProductId} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-[11px] text-red-500 font-medium line-clamp-1">{s.failedTitle}</p>
                    <p className="text-[10px] text-gray-400 font-mono">{s.failedAsin} · {s.failedReason}</p>
                  </div>
                  <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded flex-shrink-0">suprimido</span>
                </div>
                <div className="flex gap-2">
                  {s.candidates.slice(0, 3).map(c => (
                    <div key={c.productId} className="flex-1 bg-gray-50 rounded p-2">
                      <p className="text-[10px] font-mono text-blue-600">{c.asin}</p>
                      <p className="text-[10px] text-gray-700 line-clamp-1 mt-0.5">{c.title}</p>
                      <p className="text-[9px] text-gray-400 mt-0.5">${c.price.toFixed(2)} · {Math.round(c.similarity * 100)}% similitud</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {report.staleProducts.length > 0 && (
        <Card>
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">⏳ Productos stale — {report.staleProducts.length}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {report.staleProducts.slice(0, 6).map(s => (
              <span key={s.productId} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded">
                <span className="font-mono">{s.asin}</span>
                <span className="text-gray-400 ml-1">{s.reason === 'never_checked' ? '(nunca)' : `${s.staleDays}d sin check`}</span>
              </span>
            ))}
            {report.staleProducts.length > 6 && <span className="text-[10px] text-gray-400 px-2 py-1">+{report.staleProducts.length - 6} más</span>}
          </div>
        </Card>
      )}

      {!hasArchived && !hasRecovered && !hasRepairs && !hasReplacements && (
        <Card><p className="text-center text-sm text-green-600 font-medium py-6">✅ Catálogo saludable — ningún producto requirió intervención.</p></Card>
      )}

      <p className="text-[10px] text-gray-400 mt-2">
        Trigger manual: <code className="font-mono bg-gray-100 px-1 rounded">POST /api/catalog/self-healing/run</code>
        {' '}· Rate limit: 1 ciclo por hora.
      </p>
    </section>
  )
}
