/**
 * components/admin/nerve/ZoneNextCycle.tsx
 *
 * Nerve Center — Zona 3: PRÓXIMO CICLO
 *
 * Si el ciclo está ejecutando: "En ejecución".
 * Si hay nextRunAt futuro: hora en Bogotá + CountdownDisplay (client).
 * Si no hay nextRunAt: "No programado".
 *
 * Server Component — solo el CountdownDisplay es cliente.
 */

import Link                  from 'next/link'
import type { RemainingDuration } from '@/lib/ops/time'
import { CountdownDisplay }  from './CountdownDisplay'

interface Props {
  nextRunAt:   string | null
  remaining:   RemainingDuration | null
  isRunning:   boolean
}

function formatBogotaTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
    timeZone: 'America/Bogota',
  }).format(new Date(iso))
}

export function ZoneNextCycle({ nextRunAt, remaining, isRunning }: Props) {
  const hasCountdown = !isRunning && nextRunAt && remaining && !remaining.isPast

  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Próximo Ciclo
      </p>

      {isRunning ? (
        <p className="text-sm font-semibold text-yellow-600">En ejecución</p>
      ) : hasCountdown ? (
        <div className="grid grid-cols-[140px_1fr] gap-y-3 text-sm">

          <span className="text-gray-400">Próximo</span>
          <span className="font-mono text-gray-800">
            {formatBogotaTime(nextRunAt!)}
            <span className="text-gray-400 ml-1.5">Bogotá</span>
          </span>

          <span className="text-gray-400">En</span>
          <CountdownDisplay remainingMs={remaining!.totalMs} />

        </div>
      ) : (
        <p className="text-sm text-gray-400">No programado</p>
      )}

      <div className="mt-5 text-right">
        <Link
          href="/admin/automation"
          className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
        >
          Automation Center →
        </Link>
      </div>
    </section>
  )
}
