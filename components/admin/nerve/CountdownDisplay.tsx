/**
 * components/admin/nerve/CountdownDisplay.tsx
 *
 * Client Component — único componente cliente del Nerve Center.
 *
 * Recibe remainingMs desde el servidor y lo decrementa cada segundo.
 * Nunca consulta el backend. Nunca recalcula nextRunAt.
 * Solo disminuye visualmente el valor inicial recibido.
 *
 * Cuando llega a cero: "Actualizando…"
 * La siguiente navegación o refresh traerá el nuevo estado real.
 */

'use client'

import { useEffect, useState } from 'react'

interface Props {
  remainingMs: number
}

function formatMs(ms: number): string {
  const total   = Math.floor(ms / 1000)
  const days    = Math.floor(total / 86400)
  const hours   = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad     = (n: number) => String(n).padStart(2, '0')

  if (days > 0)         return `${days}d ${pad(hours)}h`
  if (hours > 0)        return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
  if (minutes > 0)      return `${pad(minutes)}m ${pad(seconds)}s`
  return `${seconds}s`
}

export function CountdownDisplay({ remainingMs }: Props) {
  const [ms, setMs] = useState(remainingMs)

  // Decrementa cada segundo. Mount-only — nunca re-sincroniza con el servidor.
  useEffect(() => {
    if (remainingMs <= 0) return
    const id = setInterval(
      () => setMs(prev => Math.max(0, prev - 1000)),
      1000,
    )
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (ms <= 0) {
    return (
      <span className="font-mono text-gray-400 italic">Actualizando…</span>
    )
  }

  return (
    <span className="font-mono font-bold text-gray-900">{formatMs(ms)}</span>
  )
}
