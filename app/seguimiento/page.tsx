/**
 * /seguimiento — User's watchlist page
 *
 * Server Component shell. Passes rendering to the client WatchlistGrid
 * which reads from localStorage. No server-side data needed here —
 * the grid fetches pricing data client-side after mount.
 */

import type { Metadata } from 'next'
import { Bell } from 'lucide-react'
import { WatchlistGrid } from '@/components/watchlist/WatchlistGrid'

export const metadata: Metadata = {
  title: 'Mis productos seguidos | GOODPRICE',
  description: 'Sigue el precio de tus productos favoritos y recibe alertas cuando bajen.',
  robots: 'noindex, nofollow', // user-specific page
}

export default function SeguimientoPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="h-5 w-5 text-amber-500" />
            <h1 className="text-xl font-bold text-gray-900">Mis productos seguidos</h1>
          </div>
          <p className="text-sm text-gray-500">
            Te avisamos cuando bajen de precio en Colombia.
          </p>
        </div>

        {/* Watchlist — client-rendered from localStorage */}
        <WatchlistGrid />
      </div>
    </main>
  )
}
