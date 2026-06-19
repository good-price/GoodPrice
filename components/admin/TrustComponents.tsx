/**
 * components/admin/TrustComponents.tsx
 *
 * Trust tier visibility and suppression breakdown.
 * Used in /admin/audit.
 * SelfHealingSection removed (OPS V2 Fase 1 — self-healing is automated).
 */

import type { TrustReport } from '@/lib/catalog/trust/types'
import { SectionHeader, Card, StatCard, relativeTime } from './shared'

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

