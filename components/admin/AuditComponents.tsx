/**
 * components/admin/AuditComponents.tsx
 *
 * Audit reliability scores and quarantine table.
 * Used in /admin/audit.
 */

import type { CatalogAuditReport } from '@/lib/audit/types'
import type { QuarantineEntry }    from '@/lib/audit/types'
import { SectionHeader, Card, StatCard, GradeBadge, ScoreBar, Th, Td, fmtDate, relativeTime } from './shared'

export function AuditSection({
  report,
  quarantineList,
}: {
  report:         CatalogAuditReport | null
  quarantineList: QuarantineEntry[]
}) {
  return (
    <>
      <section>
        <SectionHeader>Auditoría de catálogo — Reliability scores</SectionHeader>
        {!report ? (
          <Card>
            <div className="text-center py-8">
              <p className="text-sm font-medium text-gray-500">Sin auditoría ejecutada aún</p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                Ejecuta <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">POST /api/audit/run</code> para generar el primer reporte.
              </p>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <StatCard label="Score promedio" value={`${report.averageScore}/100`} accent={report.averageScore >= 70} warn={report.averageScore < 50} />
              <StatCard label="Productos críticos (D/F)" value={report.criticalProducts.length} warn={report.criticalProducts.length > 0} />
              <StatCard label="Amazon 404" value={report.issues.unreachableProducts} warn={report.issues.unreachableProducts > 0} />
              <StatCard label="Imágenes rotas" value={report.issues.brokenImages} warn={report.issues.brokenImages > 0} />
            </div>
            <Card className="mb-4">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Distribución de grades · {report.totalProducts} productos · Auditado: {fmtDate(report.completedAt)}
              </p>
              <div className="flex gap-6">
                {(['A', 'B', 'C', 'D', 'F'] as const).map(g => (
                  <div key={g} className="text-center">
                    <p className={`text-xl font-bold ${g === 'A' ? 'text-green-600' : g === 'B' ? 'text-blue-500' : g === 'C' ? 'text-yellow-500' : g === 'D' ? 'text-orange-500' : 'text-red-500'}`}>
                      {report.gradeDistribution[g]}
                    </p>
                    <p className="text-[11px] text-gray-400 font-bold">{g}</p>
                  </div>
                ))}
                <div className="ml-auto flex flex-col justify-center gap-1 text-right">
                  {[
                    ['ASIN inválido', report.issues.invalidAsinFormat],
                    ['Colombia bloqueado', report.issues.colombiaRestricted],
                    ['Incompletos', report.issues.incompleteProducts],
                  ].map(([label, count]) => (
                    <p key={label as string} className="text-xs text-gray-500">
                      <span className={`font-semibold ${Number(count) > 0 ? 'text-red-500' : 'text-gray-400'}`}>{count}</span>{' '}{label}
                    </p>
                  ))}
                </div>
              </div>
            </Card>
            {report.criticalProducts.length > 0 && (
              <Card>
                <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-3">⚠ Productos críticos (Grade D/F)</p>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100"><Th>Producto</Th><Th>ASIN</Th><Th>Cat.</Th><Th>Score</Th><Th>Grade</Th><Th>Issues</Th></tr></thead>
                    <tbody>
                      {report.criticalProducts.map(p => (
                        <tr key={p.productId} className="border-b border-gray-50 last:border-0 hover:bg-red-50/30">
                          <Td><span className="line-clamp-1 max-w-[180px] block">{p.title}</span>{p.brand && <span className="text-[10px] text-blue-500 uppercase font-medium">{p.brand}</span>}</Td>
                          <Td mono>{p.asin}</Td><Td muted>{p.category}</Td>
                          <td className="py-2 pr-4"><ScoreBar score={p.score} /></td>
                          <td className="py-2 pr-4"><GradeBadge grade={p.grade} /></td>
                          <Td><ul className="space-y-0.5">{p.issues.slice(0, 2).map((issue, i) => <li key={i} className="text-[10px] text-red-600 line-clamp-1">{issue}</li>)}</ul></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </section>

      <section>
        <SectionHeader>Cuarentena — productos suspendidos ({quarantineList.length})</SectionHeader>
        {quarantineList.length === 0 ? (
          <Card><p className="text-center text-sm text-gray-400 py-6">Sin productos en cuarentena.</p></Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-gray-100"><Th>Producto</Th><Th>ASIN</Th><Th>Cat.</Th><Th>Score</Th><Th>Razón</Th><Th>Cuarentenado</Th><Th>Por</Th></tr></thead>
                <tbody>
                  {quarantineList.map(q => (
                    <tr key={q.productId} className="border-b border-gray-50 last:border-0 hover:bg-orange-50/30">
                      <Td><span className="line-clamp-1 max-w-[180px] block">{q.title}</span><span className="text-[10px] font-mono text-gray-400">{q.productId}</span></Td>
                      <Td mono>{q.asin}</Td><Td muted>{q.category}</Td>
                      <Td muted>{q.score !== undefined ? `${q.score}/100` : '—'}</Td>
                      <Td><span className="text-[11px] text-orange-700 line-clamp-2">{q.reason}</span></Td>
                      <Td muted>{relativeTime(q.quarantinedAt)}</Td>
                      <Td>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${q.quarantinedBy === 'audit' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                          {q.quarantinedBy}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-400 mt-3">
              Para restaurar: <code className="font-mono bg-gray-100 px-1 rounded">DELETE /api/audit/quarantine {'{ productId }'}</code>
            </p>
          </Card>
        )}
      </section>
    </>
  )
}
