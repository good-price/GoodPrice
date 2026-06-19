/**
 * components/catalog/SupportGoodPrice.tsx
 *
 * Minimal, non-invasive donation card for Bancolombia Bre — Sprint 5A.
 * Server Component — no hooks, no modal, no popup, no animation.
 */

export function SupportGoodPrice() {
  return (
    <aside
      aria-label="Apoya GOODPRICE"
      className="border border-gray-100 rounded-2xl p-5 bg-white shadow-sm"
    >
      <p className="text-sm text-gray-500 leading-relaxed">
        ¿GOODPRICE te ayudó a encontrar un mejor precio?
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">☕</span>
        <div>
          <p className="text-sm font-semibold text-gray-800">Apoya el proyecto</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Bre Bancolombia ·{' '}
            <span className="font-mono font-medium text-gray-600">@pombo701</span>
          </p>
        </div>
      </div>
    </aside>
  )
}
