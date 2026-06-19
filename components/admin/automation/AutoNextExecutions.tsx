/**
 * components/admin/automation/AutoNextExecutions.tsx
 *
 * Automation Center — Zona 4: NEXT EXECUTIONS
 *
 * Las próximas 3 ejecuciones ordenadas por tiempo restante.
 * CountdownDisplay para el countdown visual (único client component permitido).
 *
 * Server Component — solo CountdownDisplay es cliente.
 */

import { CountdownDisplay } from '@/components/admin/nerve/CountdownDisplay'

export interface UpcomingExecution {
  id:          string
  label:       string
  nextRunAt:   string
  remainingMs: number
}

interface Props {
  upcoming: UpcomingExecution[]
}

export function AutoNextExecutions({ upcoming }: Props) {
  if (upcoming.length === 0) {
    return (
      <section>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
          Próximas Ejecuciones
        </p>
        <p className="text-sm text-gray-400">Sin ejecuciones programadas</p>
      </section>
    )
  }

  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Próximas Ejecuciones
      </p>

      <div className="space-y-4">
        {upcoming.map(item => (
          <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-4">
            <span className="text-sm font-medium text-gray-800">{item.label}</span>
            <CountdownDisplay remainingMs={item.remainingMs} />
          </div>
        ))}
      </div>
    </section>
  )
}
