import { Check, Minus } from 'lucide-react'
import type { ComparisonRow, Product } from '@/types'

interface ComparisonTableProps {
  rows: ComparisonRow[]
  productA: Product
  productB: Product
}

function WinnerBadge({ winner }: { winner: 'A' | 'B' | 'tie' | undefined }) {
  if (!winner) return null
  if (winner === 'tie') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-400">
        <Minus className="h-3 w-3" aria-hidden="true" />
        Empate
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold ${
        winner === 'A' ? 'text-blue-400' : 'text-emerald-400'
      }`}
    >
      <Check className="h-3 w-3" aria-hidden="true" />
      {winner === 'A' ? 'A gana' : 'B gana'}
    </span>
  )
}

export function ComparisonTable({ rows, productA, productB }: ComparisonTableProps) {
  return (
    <section aria-label="Tabla comparativa de especificaciones">
      <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
        <span aria-hidden="true">📊</span>
        Comparativa completa
      </h2>

      <div className="rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] bg-gradient-to-r from-[#1a1f2e] to-[#1e2438]">
          <div className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            Criterio
          </div>
          <div className="px-4 py-3 text-[11px] font-bold text-blue-400 uppercase tracking-wider">
            {productA.brand ?? 'Opción A'}
          </div>
          <div className="px-4 py-3 text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
            {productB.brand ?? 'Opción B'}
          </div>
          <div className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            Resultado
          </div>
        </div>

        {/* Rows */}
        {rows.map((row, i) => (
          <div
            key={i}
            className={`grid grid-cols-[1fr_1fr_1fr_auto] items-start border-t border-gray-100 ${
              i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'
            } ${
              row.winner === 'A'
                ? 'border-l-2 border-l-blue-200'
                : row.winner === 'B'
                ? 'border-l-2 border-l-emerald-200'
                : ''
            }`}
          >
            <div className="px-4 py-3 text-xs font-semibold text-gray-700">{row.label}</div>
            <div
              className={`px-4 py-3 text-xs text-gray-600 leading-snug ${
                row.winner === 'A' ? 'font-semibold text-blue-700' : ''
              }`}
            >
              {row.valueA}
            </div>
            <div
              className={`px-4 py-3 text-xs text-gray-600 leading-snug ${
                row.winner === 'B' ? 'font-semibold text-emerald-700' : ''
              }`}
            >
              {row.valueB}
            </div>
            <div className="px-4 py-3">
              <WinnerBadge winner={row.winner} />
            </div>
          </div>
        ))}
      </div>

      {/* Score summary */}
      {(() => {
        const winsA = rows.filter(r => r.winner === 'A').length
        const winsB = rows.filter(r => r.winner === 'B').length
        const ties  = rows.filter(r => r.winner === 'tie').length
        return (
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 px-1 flex-wrap">
            <span className="text-blue-600 font-semibold">{winsA} criterio{winsA !== 1 ? 's' : ''} para A</span>
            <span>·</span>
            <span className="text-emerald-600 font-semibold">{winsB} criterio{winsB !== 1 ? 's' : ''} para B</span>
            <span>·</span>
            <span className="text-gray-400">{ties} empate{ties !== 1 ? 's' : ''}</span>
          </div>
        )
      })()}
    </section>
  )
}
