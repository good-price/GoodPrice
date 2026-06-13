/**
 * TrustStrip — Compact row of credibility signals.
 *
 * Receives productCount from the server (app/page.tsx → getPublicCatalogStats)
 * so the number is always accurate and never hardcoded.
 */

interface TrustStripProps {
  productCount: number
}

export function TrustStrip({ productCount }: TrustStripProps) {
  const signals = [
    { icon: '✅', label: `${productCount} productos curados`       },
    { icon: '🚢', label: 'Envío a Colombia verificado'             },
    { icon: '💱', label: 'TRM actualizada diariamente'             },
    { icon: '🔔', label: 'Alertas de precio gratis'                },
  ]

  return (
    <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 py-3 px-4 bg-white border border-gray-100 rounded-xl shadow-sm">
      {signals.map(({ icon, label }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 font-medium"
        >
          <span aria-hidden="true">{icon}</span>
          {label}
        </span>
      ))}
    </div>
  )
}
