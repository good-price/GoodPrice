import Link from 'next/link'
import { ExternalLink, Trophy } from 'lucide-react'
import type { Product } from '@/types'

interface VerdictBannerProps {
  verdict: string
  winner: 'A' | 'B' | 'tie'
  productA: Product
  productB: Product
}

export function VerdictBanner({ verdict, winner, productA, productB }: VerdictBannerProps) {
  const winnerProduct = winner === 'A' ? productA : winner === 'B' ? productB : null
  const loserProduct  = winner === 'A' ? productB : winner === 'B' ? productA : null

  const winnerLabel  = winner === 'A' ? 'Opción A' : winner === 'B' ? 'Opción B' : null
  const isTie        = winner === 'tie'

  return (
    <section
      aria-label="Veredicto final"
      className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a1f2e] to-[#1e2438] border border-white/10"
    >
      <div className="px-6 py-6 sm:px-8 sm:py-7">
        {/* Title */}
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-5 w-5 text-amber-400 flex-shrink-0" aria-hidden="true" />
          <h2 className="text-base font-bold text-white">
            {isTie ? 'Veredicto final — Empate técnico' : `Veredicto final — Ganador: ${winnerLabel}`}
          </h2>
        </div>

        {/* Verdict text */}
        <div className="space-y-3 mb-6">
          {verdict.split(/\n\n+/).map((para, i) => (
            <p key={i} className="text-sm text-gray-300 leading-relaxed">
              {para}
            </p>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {winnerProduct && (
            <Link
              href={winnerProduct.amazonUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm px-5 py-3.5 transition-colors shadow-lg shadow-amber-900/30"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Ver {winnerLabel} en Amazon
            </Link>
          )}

          {isTie && (
            <>
              <Link
                href={productA.amazonUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-5 py-3.5 transition-colors"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Ver Opción A en Amazon
              </Link>
              <Link
                href={productB.amazonUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-5 py-3.5 transition-colors"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Ver Opción B en Amazon
              </Link>
            </>
          )}

          {loserProduct && !isTie && (
            <Link
              href={loserProduct.amazonUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm px-5 py-3.5 transition-colors border border-white/20"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Ver {winner === 'A' ? 'Opción B' : 'Opción A'} en Amazon
            </Link>
          )}
        </div>

        {/* Affiliate note */}
        <p className="mt-4 text-[10px] text-gray-600 text-center">
          Los precios se verifican en Amazon. Como asociado de Amazon obtenemos comisión por compras calificadas.
        </p>
      </div>
    </section>
  )
}
