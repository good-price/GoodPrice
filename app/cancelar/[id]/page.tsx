/**
 * /cancelar/[id] — One-click alert unsubscribe
 *
 * Linked from email footers: clicking → GET this page → subscription deactivated.
 * Server Component: deactivation happens server-side on first render.
 *
 * Handles three states:
 *   - Success:      subscription deactivated, confirmation shown
 *   - Already off:  was already inactive, friendly message
 *   - Not found:    invalid or already expired ID
 *
 * No auth required — the subscription ID itself is the unforgeable token.
 * (IDs are random hex, not sequential — not guessable.)
 */

import type { Metadata } from 'next'
import { CheckCircle, BellOff, AlertCircle } from 'lucide-react'
import { getSubscription, deactivateSubscription } from '@/lib/watchlist/alert-store'

export const metadata: Metadata = {
  title: 'Cancelar alerta | GOODPRICE',
  robots: 'noindex, nofollow',
}

// Force dynamic — must run server-side on every request (not cached)
export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

export default async function CancelarPage({ params }: PageProps) {
  const { id } = params

  // Attempt to deactivate
  const subscription = id ? await getSubscription(id).catch(() => null) : null
  let state: 'success' | 'already_inactive' | 'not_found'

  if (!subscription) {
    state = 'not_found'
  } else if (!subscription.isActive) {
    state = 'already_inactive'
  } else {
    await deactivateSubscription(id).catch(() => null)
    state = 'success'
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">

        {/* Logo */}
        <p className="text-lg font-extrabold text-gray-900 mb-6">
          GOOD<span className="text-[#F7A823]">PRICE</span>
        </p>

        {state === 'success' && (
          <>
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-12 w-12 text-emerald-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              Alerta cancelada
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed mb-1">
              Ya no recibirás notificaciones de precio para este producto.
            </p>
            {subscription?.productTitle && (
              <p className="text-xs text-gray-400 mt-2 line-clamp-2">
                {subscription.productTitle}
              </p>
            )}
          </>
        )}

        {state === 'already_inactive' && (
          <>
            <div className="flex justify-center mb-4">
              <BellOff className="h-12 w-12 text-gray-400" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              Alerta ya inactiva
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              Esta alerta ya estaba cancelada. No hay nada más que hacer.
            </p>
          </>
        )}

        {state === 'not_found' && (
          <>
            <div className="flex justify-center mb-4">
              <AlertCircle className="h-12 w-12 text-amber-400" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              Enlace inválido
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              Este enlace de cancelación no es válido o ya expiró.
            </p>
          </>
        )}

        {/* Back link */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <a
            href="/productos"
            className="text-sm text-[#F7A823] font-semibold hover:underline"
          >
            Ver catálogo de productos →
          </a>
        </div>
      </div>
    </main>
  )
}
