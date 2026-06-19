/**
 * components/admin/activity/ActivityActions.tsx
 *
 * Activity Center — Zona 4: ACCIONES EJECUTADAS
 *
 * Totales acumulados de acciones en los logs cargados:
 *   removed · repaired · suppressed · recovered · flagged
 *
 * NO persiste datos. Solo suma lo que viene en los logs pasados como prop.
 *
 * Server Component.
 */

interface Props {
  removed:    number
  repaired:   number
  suppressed: number
  recovered:  number
  flagged:    number
}

export function ActivityActions({ removed, repaired, suppressed, recovered, flagged }: Props) {
  const total = removed + repaired + suppressed + recovered + flagged

  if (total === 0) {
    return (
      <section>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
          Acciones Ejecutadas
        </p>
        <p className="text-sm text-gray-400">Sin acciones registradas en los últimos 50 eventos</p>
      </section>
    )
  }

  const rows = [
    { label: 'Eliminados',   value: removed,    cls: removed    > 0 ? 'text-red-500'    : 'text-gray-400' },
    { label: 'Reparados',    value: repaired,   cls: repaired   > 0 ? 'text-green-600'  : 'text-gray-400' },
    { label: 'Suprimidos',   value: suppressed, cls: suppressed > 0 ? 'text-yellow-600' : 'text-gray-400' },
    { label: 'Recuperados',  value: recovered,  cls: recovered  > 0 ? 'text-blue-600'   : 'text-gray-400' },
    { label: 'Marcados',     value: flagged,    cls: flagged    > 0 ? 'text-orange-500' : 'text-gray-400' },
  ]

  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Acciones Ejecutadas
      </p>

      <div className="grid grid-cols-[160px_1fr] gap-y-2.5 text-sm">
        {rows.map(({ label, value, cls }) => (
          <>
            <span key={`${label}-l`} className="text-gray-400">{label}</span>
            <span key={`${label}-v`} className={`font-medium tabular-nums ${cls}`}>{value}</span>
          </>
        ))}
      </div>

      <p className="mt-3 text-[10px] text-gray-300">
        Calculado sobre los últimos 50 eventos cargados
      </p>
    </section>
  )
}
