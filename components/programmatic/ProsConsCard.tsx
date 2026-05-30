import { Check, X } from 'lucide-react'
import type { Product } from '@/types'

interface ProsConsCardProps {
  product: Product
  pros: string[]
  cons: string[]
  label: 'A' | 'B'
}

export function ProsConsCard({ product, pros, cons, label }: ProsConsCardProps) {
  const accentColor = label === 'A' ? 'blue' : 'emerald'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span
          className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 mt-0.5 ${
            accentColor === 'blue'
              ? 'bg-blue-50 text-blue-600 border border-blue-200'
              : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
          }`}
        >
          Opción {label}
        </span>
        <div>
          <p className="text-sm font-bold text-gray-800 leading-snug">{product.title}</p>
          <p className="text-base font-extrabold text-amber-500 mt-0.5">
            ${product.price.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Pros */}
      {pros.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider mb-2">
            ✓ A favor
          </p>
          <ul className="space-y-1.5">
            {pros.map((pro, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>{pro}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cons */}
      {cons.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider mb-2">
            ✗ En contra
          </p>
          <ul className="space-y-1.5">
            {cons.map((con, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                <X className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>{con}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
