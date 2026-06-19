/**
 * components/catalog/intelligence/ProductReasons.tsx
 *
 * Renders the human-readable recommendation signals for a product.
 * Server Component — no hooks, no client state.
 */

interface Props {
  reasons: string[]
}

export function ProductReasons({ reasons }: Props) {
  if (reasons.length === 0) return null

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Por qué lo recomendamos
      </p>
      <ul className="space-y-1" aria-label="Señales de recomendación">
        {reasons.map((reason, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
            <span className="mt-0.5 text-green-500 shrink-0" aria-hidden="true">✓</span>
            {reason}
          </li>
        ))}
      </ul>
    </div>
  )
}
