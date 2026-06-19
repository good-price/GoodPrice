/**
 * components/admin/nerve/MaintenanceBanner.tsx
 *
 * Nerve Center — Banner condicional: MANTENIMIENTO PROGRAMADO
 *
 * Solo se renderiza cuando siteMode.mode === 'scheduled_maintenance'.
 * Server Component. Sin lógica de negocio.
 */

import type { SiteModeState } from '@/lib/system/site-mode'

interface Props {
  siteMode: SiteModeState
}

export function MaintenanceBanner({ siteMode }: Props) {
  if (siteMode.mode !== 'scheduled_maintenance') return null

  return (
    <div className="mb-6 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3">
      <p className="text-sm font-semibold text-yellow-800">
        Mantenimiento Programado
      </p>
      <p className="mt-0.5 text-[12px] text-yellow-700">
        El sistema está ejecutando el ciclo automatizado nocturno. Algunas funciones pueden estar temporalmente limitadas.
      </p>
    </div>
  )
}
