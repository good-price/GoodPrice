'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RefreshCw, Home } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GOODPRICE Error]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-xl font-bold text-gray-800 mb-2">Algo salió mal</h1>
      <p className="text-gray-500 text-sm max-w-sm mb-8">
        Ocurrió un error cargando esta página. Puedes intentar de nuevo o volver al inicio.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 bg-[#F7A823] hover:bg-[#e8961a] text-black font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Intentar de nuevo
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-5 py-2.5 rounded-xl text-sm border border-gray-200 transition-colors"
        >
          <Home className="h-4 w-4" />
          Ir al inicio
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 text-[11px] text-gray-300 font-mono">Error ID: {error.digest}</p>
      )}
    </div>
  )
}
