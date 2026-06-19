/**
 * components/admin/nerve/ZoneOverdue.tsx
 *
 * Nerve Center — Zona de alertas: OVERDUE
 *
 * Si no hay ítems: "Todo al día".
 * Si hay ítems: lista de automatizaciones que debieron ejecutarse.
 *
 * Server Component. Sin lógica de negocio.
 */

interface OverdueItem {
  id:        string
  label:     string
  overdueMs: number
}

interface Props {
  overdueItems: OverdueItem[]
}

function formatOverdue(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000)
  const days    = Math.floor(total / 86400)
  const hours   = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)

  if (days > 0)   return `${days}d ${hours}h`
  if (hours > 0)  return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return 'menos de 1m'
}

export function ZoneOverdue({ overdueItems }: Props) {
  if (overdueItems.length === 0) {
    return (
      <section>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
          Alertas
        </p>
        <p className="text-sm text-green-600 font-medium">Todo al día</p>
      </section>
    )
  }

  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Alertas
      </p>

      <div className="space-y-2">
        {overdueItems.map(item => (
          <div key={item.id} className="flex items-baseline gap-3 text-sm">
            <span className="text-red-500 font-bold">!</span>
            <span className="text-gray-800 font-medium">{item.label}</span>
            <span className="text-[11px] text-red-500">
              Debió ejecutarse hace {formatOverdue(item.overdueMs)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
