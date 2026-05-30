/**
 * TrustStrip — Compact row of credibility signals
 *
 * Static, honest numbers about the platform. No JS required.
 * Rendered on the homepage between the hero and the category grid.
 */

const signals = [
  { icon: '🛍', label: '19 productos rastreados' },
  { icon: '⏱', label: 'Actualizado cada hora'    },
  { icon: '🇨🇴', label: 'Precios para Colombia'   },
  { icon: '🔔', label: 'Alertas gratuitas'        },
]

export function TrustStrip() {
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
