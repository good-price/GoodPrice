/**
 * components/admin/catalog/LifecycleProducts.tsx
 *
 * Catalog Center — Zona 10: LIFECYCLE PRODUCTS
 *
 * Table showing the 20 most deteriorated products in the lifecycle store.
 *
 * Columns: ASIN | Categoría | Health | Age | Stale Days | Confidence | Reemplazo
 *
 * Sort: critical → stale → aging → healthy (within each group, staleDays desc).
 *
 * Server Component. No hooks.
 */

import type { ProductLifecycle } from '@/lib/catalog/lifecycle/types'
import { Card, SectionHeader, Th, Td } from '@/components/admin/shared'

// ── Sub-components ────────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: ProductLifecycle['health'] }) {
  const styles: Record<string, string> = {
    healthy:  'bg-green-100 text-green-700',
    aging:    'bg-yellow-100 text-yellow-700',
    stale:    'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-600',
  }
  const labels: Record<string, string> = {
    healthy: 'OK', aging: 'Aging', stale: 'Stale', critical: 'Crítico',
  }
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${styles[health] ?? 'bg-gray-100 text-gray-400'}`}>
      {labels[health] ?? health}
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
    <span className={`tabular-nums font-medium text-[11px] ${color}`}>
      {value > 0 ? value : '—'}
    </span>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const HEALTH_ORDER: Record<ProductLifecycle['health'], number> = {
  critical: 0,
  stale:    1,
  aging:    2,
  healthy:  3,
}

function sortProducts(products: ProductLifecycle[]): ProductLifecycle[] {
  return [...products].sort((a, b) => {
    const healthDiff = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]
    if (healthDiff !== 0) return healthDiff
    return b.staleDays - a.staleDays
  })
}

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  products: ProductLifecycle[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LifecycleProducts({ products }: Props) {
  if (products.length === 0) {
    return (
      <section>
        <SectionHeader>Lifecycle Products</SectionHeader>
        <Card>
          <p className="text-center text-sm text-gray-400 py-4">
            Sin datos de ciclo de vida.
          </p>
        </Card>
      </section>
    )
  }

  const sorted  = sortProducts(products).slice(0, 20)

  return (
    <section>
      <SectionHeader>Lifecycle Products</SectionHeader>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-gray-100">
              <Th>ASIN</Th>
              <Th>Categoría</Th>
              <Th>Health</Th>
              <Th>Edad</Th>
              <Th>Stale</Th>
              <Th>Conf.</Th>
              <Th>Reemplazo</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.asin} className="border-b border-gray-50 last:border-0">
                <Td mono muted>
                  <span className="text-[10px]">{p.asin}</span>
                </Td>
                <Td>
                  <span className="text-[11px]">
                    {CATEGORY_LABELS[p.category] ?? p.category}
                  </span>
                </Td>
                <Td>
                  <HealthBadge health={p.health} />
                </Td>
                <Td muted>
                  <span className="tabular-nums text-[11px]">{p.ageDays}d</span>
                </Td>
                <Td muted>
                  <span className={`tabular-nums text-[11px] ${
                    p.staleDays >= 60 ? 'text-red-500 font-semibold' :
                    p.staleDays >= 30 ? 'text-orange-500' :
                    p.staleDays >= 15 ? 'text-yellow-600' :
                    'text-gray-400'
                  }`}>
                    {p.staleDays}d
                  </span>
                </Td>
                <Td>
                  <ScoreCell value={p.confidenceScore} />
                </Td>
                <Td>
                  {p.needsReplacement
                    ? <span className="text-[10px] font-semibold text-red-600 uppercase tracking-wide">Sí</span>
                    : <span className="text-[10px] text-gray-300">—</span>
                  }
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="mt-2 text-[10px] text-gray-400">
        20 productos más deteriorados · crítico → stale → aging · por staleDays desc
      </p>
    </section>
  )
}
