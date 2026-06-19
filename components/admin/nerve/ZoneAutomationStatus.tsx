/**
 * components/admin/nerve/ZoneAutomationStatus.tsx
 *
 * Nerve Center — Zona 5: AUTOMATION STATUS
 *
 * Muestra las 5 automatizaciones operacionales principales:
 *   cycle-3am · trm-update · paapi-sync · live-truth · repair
 *
 * Para cada una: nombre · último estado · hace cuánto corrió.
 *
 * Fuente: readAutomationState() — solo AutomationRunState.
 * Server Component. Sin lógica de negocio.
 */

import Link from 'next/link'
import type { AutomationStateFile } from '@/lib/ops/automation'

interface Props {
  autoState: AutomationStateFile
}

const DISPLAYED_AUTOMATIONS = [
  { id: 'cycle-3am',   label: 'Ciclo 3AM'   },
  { id: 'trm-update',  label: 'TRM Update'  },
  { id: 'paapi-sync',  label: 'PAAPI Sync'  },
  { id: 'live-truth',  label: 'Live Truth'  },
  { id: 'repair',      label: 'Repair'      },
] as const

const STATUS_META: Record<string, { icon: string; cls: string }> = {
  success:   { icon: '✓', cls: 'text-green-600' },
  partial:   { icon: '~', cls: 'text-yellow-600' },
  failed:    { icon: '✗', cls: 'text-red-500' },
  cancelled: { icon: '—', cls: 'text-gray-400' },
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Sin ejecuciones'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)     return 'ahora mismo'
  if (ms < 3_600_000)  return `hace ${Math.floor(ms / 60_000)}m`
  if (ms < 86_400_000) return `hace ${Math.floor(ms / 3_600_000)}h`
  return `hace ${Math.floor(ms / 86_400_000)}d`
}

export function ZoneAutomationStatus({ autoState }: Props) {
  return (
    <section>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
        Automation Status
      </p>

      <div className="space-y-2">
        {DISPLAYED_AUTOMATIONS.map(({ id, label }) => {
          const state  = autoState.automations[id]
          const meta   = state?.lastStatus
            ? (STATUS_META[state.lastStatus] ?? { icon: '?', cls: 'text-gray-400' })
            : null
          const when   = relativeTime(state?.lastRunAt ?? null)

          return (
            <div
              key={id}
              className="grid grid-cols-[160px_40px_1fr] items-center gap-x-2 text-sm"
            >
              <span className="text-gray-700 font-medium">{label}</span>

              {meta ? (
                <span className={`font-bold text-center ${meta.cls}`}>{meta.icon}</span>
              ) : (
                <span className="text-gray-300 text-center">·</span>
              )}

              <span className="text-[11px] text-gray-400">{when}</span>
            </div>
          )
        })}
      </div>

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
