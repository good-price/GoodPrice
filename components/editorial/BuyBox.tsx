import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { Product } from '@/types'

interface BuyBoxProps {
  product: Product
  /** Override the default CTA label */
  label?: string
}

export function BuyBox({ product, label = 'Ver en Amazon' }: BuyBoxProps) {
  return (
    <div className="flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
      <div className="min-w-0">
        <p className="text-xs text-gray-500 mb-0.5 truncate">{product.title}</p>
        <p className="text-xl font-bold text-gray-900">
          ${product.price.toFixed(2)}
          <span className="text-xs font-normal text-gray-400 ml-1">USD</span>
        </p>
        {product.oldPrice && product.oldPrice > product.price && (
          <p className="text-xs text-gray-400 line-through">
            ${product.oldPrice.toFixed(2)}
          </p>
        )}
      </div>

      <Link
        href={product.amazonUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="flex items-center gap-2 bg-[#F7A823] hover:bg-[#e8961a] active:bg-[#d48117] text-black text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex-shrink-0"
      >
        {label}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  )
}
