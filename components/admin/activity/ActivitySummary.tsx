/**
 * components/admin/activity/ActivitySummary.tsx
 *
 * Activity Center — Zona 1: RESUMEN
 *
 * Totales acumulados de todos los eventos históricos (desde readLogsSummary).
 * Server Component.
 */

interface Props {
  total:     number
  success:   number
  partial:   number
  failed:    number
  cancelled: number
}

export function ActivitySummary({ total, success, partial, failed, cancelled }: Props) {
  if (total === 0) {
    return (
      <section>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
          Resumen
        </p>
        <p className="text-sm text-gray-400">Sin eventos registrados</p>
      </section>
    )
  }

  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Resumen
      </p>

      <div className="grid grid-cols-[160px_1fr] gap-y-2.5 text-sm">

        <span className="text-gray-400">Eventos</span>
        <span className="font-medium text-gray-700 tabular-nums">{total}</span>

        <span className="text-gray-400">Success</span>
        <span className="font-medium text-green-600 tabular-nums">{success}</span>

        <span className="text-gray-400">Partial</span>
        <span className={`font-medium tabular-nums ${partial > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
          {partial}
        </span>

        <span className="text-gray-400">Failed</span>
        <span className={`font-medium tabular-nums ${failed > 0 ? 'text-red-500' : 'text-gray-400'}`}>
          {failed}
        </span>

        <span className="text-gray-400">Cancelled</span>
        <span className={`font-medium tabular-nums ${cancelled > 0 ? 'text-gray-500' : 'text-gray-400'}`}>
          {cancelled}
        </span>

      </div>
    </section>
  )
}
