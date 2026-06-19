/**
 * components/admin/catalog/DiscoveryOperations.tsx
 *
 * Catalog Center — Zona 6: DISCOVERY OPERATIONS
 *
 * Tabla de estado de Amazon Discovery por categoría (10 filas fijas).
 * Muestra: última ejecución, estado, duración, parseados, validados, guardados,
 *          Acceptance Rate (validated/parsed), Conversion Rate (saved/validated),
 *          Failure Rate (failedRuns/totalRuns, from cumulative metrics).
 *
 * Sprint 4C: added rate columns using DiscoveryMetricsFile.
 *
 * Server Component.
 */

import type { DiscoveryStateFile }   from '@/lib/catalog/discovery/state'
import type { DiscoveryMetricsFile } from '@/lib/catalog/discovery/metrics'
import { Card, SectionHeader, Th, Td, relativeTime } from '@/components/admin/shared'

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = [
  'bebes', 'belleza', 'cocina', 'deporte', 'electronica',
  'gaming', 'herramientas', 'hogar', 'mascotas', 'oficina',
] as const

const CATEGORY_LABELS: Record<string, string> = {
  bebes:        'Bebés',
  belleza:      'Belleza',
  cocina:       'Cocina',
  deporte:      'Deporte',
  electronica:  'Electrónica',
  gaming:       'Gaming',
  herramientas: 'Herramientas',
  hogar:        'Hogar',
  mascotas:     'Mascotas',
  oficina:      'Oficina',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'success' | 'partial' | 'failed' | null }) {
  if (!status) {
    return <span className="text-[10px] text-gray-300 font-mono">—</span>
  }
  const styles = {
    success: 'bg-green-100 text-green-700',
    partial: 'bg-yellow-100 text-yellow-700',
    failed:  'bg-red-100 text-red-600',
  }
  const labels = { success: 'OK', partial: 'Parcial', failed: 'Error' }
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

function Num({ n }: { n: number }) {
  if (n === 0) return <span className="text-gray-300 tabular-nums">—</span>
  return <span className="text-gray-700 tabular-nums">{n.toLocaleString()}</span>
}

function Rate({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-300">—</span>
  const pct = Math.round(value * 100)
  const color =
    pct >= 70 ? 'text-green-600' :
    pct >= 30 ? 'text-yellow-600' :
                'text-red-500'
  return <span className={`tabular-nums text-[11px] font-medium ${color}`}>{pct}%</span>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  return Math.min(numerator / denominator, 1)
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  discoveryState:   DiscoveryStateFile
  discoveryMetrics: DiscoveryMetricsFile
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DiscoveryOperations({ discoveryState, discoveryMetrics }: Props) {
  return (
    <section>
      <SectionHeader>Discovery Operations</SectionHeader>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-gray-100">
              <Th>Categoría</Th>
              <Th>Última ej.</Th>
              <Th>Estado</Th>
              <Th>Dur.</Th>
              <Th>Parse</Th>
              <Th>Valid.</Th>
              <Th>Guard.</Th>
              <Th>Acept.</Th>
              <Th>Conv.</Th>
              <Th>Fallo</Th>
            </tr>
          </thead>
          <tbody>
            {ALL_CATEGORIES.map(cat => {
              const s = discoveryState.categories[cat]
              const m = discoveryMetrics.categories[cat]

              // Per-run rates (from last run state)
              const acceptRate = safeRate(s?.lastValidated ?? 0, s?.lastParsed ?? 0)
              const convRate   = safeRate(s?.lastSaved     ?? 0, s?.lastValidated ?? 0)
              // Cumulative failure rate (from metrics)
              const failRate   = safeRate(m?.failedRuns ?? 0, m?.totalRuns ?? 0)

              return (
                <tr key={cat} className="border-b border-gray-50 last:border-0">
                  <Td>
                    <span className="font-medium capitalize">{CATEGORY_LABELS[cat] ?? cat}</span>
                  </Td>
                  <Td muted>
                    {s?.lastRunAt
                      ? <span title={s.lastRunAt}>{relativeTime(s.lastRunAt)}</span>
                      : <span className="text-gray-300">—</span>
                    }
                  </Td>
                  <Td>
                    <StatusBadge status={s?.lastStatus ?? null} />
                  </Td>
                  <Td mono muted>
                    {s?.lastDurationMs
                      ? `${(s.lastDurationMs / 1000).toFixed(1)}s`
                      : <span className="text-gray-300">—</span>
                    }
                  </Td>
                  <Td><Num n={s?.lastParsed    ?? 0} /></Td>
                  <Td><Num n={s?.lastValidated ?? 0} /></Td>
                  <Td>
                    {(s?.lastSaved ?? 0) > 0
                      ? <span className="text-green-600 font-semibold tabular-nums">{s!.lastSaved}</span>
                      : <span className="text-gray-300 tabular-nums">—</span>
                    }
                  </Td>
                  <Td><Rate value={acceptRate} /></Td>
                  <Td><Rate value={convRate} /></Td>
                  <Td>
                    {failRate !== null
                      ? <Rate value={failRate} />
                      : <span className="text-gray-300">—</span>
                    }
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <p className="mt-2 text-[10px] text-gray-400">
        Acept. = validated/parsed (último run) · Conv. = saved/validated (último run) · Fallo = failedRuns/totalRuns (acumulado)
      </p>
    </section>
  )
}
