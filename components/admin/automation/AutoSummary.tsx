/**
 * components/admin/automation/AutoSummary.tsx
 *
 * Automation Center — Zona 1: RESUMEN
 *
 * Conteo rápido de todas las dimensiones operacionales:
 * total · habilitadas · deshabilitadas · overdue · ejecutándose
 *
 * Server Component.
 */

interface Props {
  total:    number
  enabled:  number
  disabled: number
  overdue:  number
  running:  number
}

interface StatRow {
  label: string
  value: number
  cls?:  string
}

export function AutoSummary({ total, enabled, disabled, overdue, running }: Props) {
  const rows: StatRow[] = [
    { label: 'Automatizaciones', value: total },
    { label: 'Habilitadas',      value: enabled,  cls: 'text-green-600' },
    { label: 'Deshabilitadas',   value: disabled,  cls: disabled > 0 ? 'text-yellow-600' : undefined },
    { label: 'Overdue',          value: overdue,   cls: overdue > 0 ? 'text-red-500' : undefined },
    { label: 'En ejecución',     value: running,   cls: running > 0 ? 'text-yellow-600 font-semibold' : undefined },
  ]

  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Resumen
      </p>

      <div className="grid grid-cols-[180px_1fr] gap-y-2.5 text-sm">
        {rows.map(({ label, value, cls }) => (
          <>
            <span key={`${label}-label`} className="text-gray-400">{label}</span>
            <span key={`${label}-value`} className={`tabular-nums font-medium ${cls ?? 'text-gray-700'}`}>
              {value}
            </span>
          </>
        ))}
      </div>
    </section>
  )
}
