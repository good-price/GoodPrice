'use client'

import { useState } from 'react'
import type { SiteMode } from '@/lib/system/site-mode'

interface Props {
  currentMode: SiteMode
}

export function SiteModeToggle({ currentMode }: Props) {
  const [mode,    setMode]    = useState<SiteMode>(currentMode)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const targetMode: SiteMode = mode === 'public' ? 'development' : 'public'

  async function handleToggle() {
    if (!confirm(
      targetMode === 'development'
        ? '¿Activar modo DEVELOPMENT? Las rutas públicas quedarán inaccesibles para visitantes.'
        : '¿Activar modo PUBLIC? El sitio volverá a ser accesible para todos.'
    )) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/system/site-mode', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mode: targetMode }),
      })
      const data = await res.json() as { ok: boolean; current?: string; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Error desconocido')
      setMode(targetMode)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cambiar el modo')
    } finally {
      setLoading(false)
    }
  }

  const isPublic = mode === 'public'

  return (
    <div className="space-y-4">

      {/* Current mode badge */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
          isPublic
            ? 'bg-green-100 text-green-700'
            : 'bg-yellow-100 text-yellow-700'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isPublic ? 'bg-green-500' : 'bg-yellow-500'}`} />
          {isPublic ? 'PUBLIC' : 'DEVELOPMENT'}
        </span>
        <span className="text-[11px] text-gray-400">
          {isPublic
            ? 'Sitio activo — rutas públicas accesibles'
            : 'Sitio en desarrollo — tráfico público redirigido'}
        </span>
      </div>

      {/* Toggle button */}
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${
          isPublic
            ? 'border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
            : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
        }`}
      >
        {loading ? '…' : isPublic ? '⟳ Activar DEVELOPMENT' : '⟳ Activar PUBLIC'}
      </button>

      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}
    </div>
  )
}
