/**
 * components/admin/catalog/DiscoveryGovernance.tsx
 *
 * Catalog Center — Zona 8: DISCOVERY GOVERNANCE
 *
 * Tabla de salud del Candidate Pool por categoría.
 * Muestra: candidatos, calidad promedio, confianza promedio, estado, urgencia.
 *
 * Server Component.
 */

import type { PoolGovernance } from '@/lib/catalog/discovery/governance'
import { Card, SectionHeader, Th, Td } from '@/components/admin/shared'

// ── Sub-components ────────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: PoolGovernance['health'] }) {
  const styles = {
    healthy:  'bg-green-100 text-green-700',
    warning:  'bg-yellow-100 text-yellow-700',
    critical: 'bg-red-100 text-red-600',
  }
  const labels = { healthy: 'Sano', warning: 'Alerta', critical: 'Crítico' }
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${styles[health]}`}>
      {labels[health]}
    </span>
  )
}

function ScoreCell({ value }: { value: number }) {
  const color =
    value >= 70 ? 'text-green-600' :
    value >= 40 ? 'text-yellow-600' :
    value > 0   ? 'text-red-500'   :
                  'text-gray-300'
  return (
    <span className={`tabular-nums font-medium ${color}`}>
      {value > 0 ? value : '—'}
    </span>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  governance: PoolGovernance[]
}

// ── Component ─────────────────────────────────────────────────────────────────

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

export function DiscoveryGovernance({ governance }: Props) {
  const criticalCount = governance.filter(g => g.health === 'critical').length
  const needsCount    = governance.filter(g => g.needsDiscovery).length

  return (
    <section>
      <SectionHeader>Discovery Governance</SectionHeader>

      {/* Summary chips */}
      {(criticalCount > 0 || needsCount > 0) && (
        <div className="flex flex-wrap gap-2 mb-3">
          {criticalCount > 0 && (
            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">
              {criticalCount} categoría{criticalCount > 1 ? 's' : ''} crítica{criticalCount > 1 ? 's' : ''}
            </span>
          )}
          {needsCount > 0 && (
            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
              {needsCount} requiere{needsCount > 1 ? 'n' : ''} discovery
            </span>
          )}
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <thead>
            <tr className="border-b border-gray-100">
              <Th>Categoría</Th>
              <Th>Candidatos</Th>
              <Th>Calidad</Th>
              <Th>Confianza</Th>
              <Th>Estado</Th>
              <Th>Discovery</Th>
            </tr>
          </thead>
          <tbody>
            {governance.map(g => (
              <tr key={g.category} className="border-b border-gray-50 last:border-0">
                <Td>
                  <span className="font-medium capitalize">
                    {CATEGORY_LABELS[g.category] ?? g.category}
                  </span>
                </Td>
                <Td>
                  <span className={`tabular-nums font-semibold ${
                    g.candidateCount === 0 ? 'text-gray-300' :
                    g.candidateCount < 5   ? 'text-red-500'  :
                    g.candidateCount < 20  ? 'text-yellow-600' :
                                             'text-green-600'
                  }`}>
                    {g.candidateCount}
                  </span>
                </Td>
                <Td><ScoreCell value={g.qualityAverage} /></Td>
                <Td><ScoreCell value={g.confidenceAverage} /></Td>
                <Td><HealthBadge health={g.health} /></Td>
                <Td>
                  {g.needsDiscovery
                    ? <span className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide">Sí</span>
                    : <span className="text-[10px] text-gray-300">—</span>
                  }
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  )
}
