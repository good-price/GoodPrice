/**
 * components/admin/catalog/DiscoveryActions.tsx
 *
 * Catalog Center — Zona 7: DISCOVERY ACTIONS
 *
 * Formulario de ejecución manual de Amazon Discovery.
 * Selecciona categoría y dispara runDiscoveryAction (Server Action).
 * Muestra banner de éxito/error según ?discovery= query param.
 *
 * Server Component.
 */

import { runDiscoveryAction } from '@/lib/catalog/discovery/actions'
import { Card, SectionHeader } from '@/components/admin/shared'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'bebes',        label: 'Bebés' },
  { value: 'belleza',      label: 'Belleza' },
  { value: 'cocina',       label: 'Cocina' },
  { value: 'deporte',      label: 'Deporte' },
  { value: 'electronica',  label: 'Electrónica' },
  { value: 'gaming',       label: 'Gaming' },
  { value: 'herramientas', label: 'Herramientas' },
  { value: 'hogar',        label: 'Hogar' },
  { value: 'mascotas',     label: 'Mascotas' },
  { value: 'oficina',      label: 'Oficina' },
]

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  discoveryStatus?: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DiscoveryActions({ discoveryStatus }: Props) {
  return (
    <section>
      <SectionHeader>Ejecutar Discovery</SectionHeader>

      {/* Success / failed banner */}
      {discoveryStatus === 'success' && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-[12px] font-medium text-green-700">
          Discovery completado. Candidatos guardados en el pool.
        </div>
      )}
      {discoveryStatus === 'failed' && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-[12px] font-medium text-red-600">
          Discovery falló o no encontró candidatos nuevos.
        </div>
      )}

      <Card>
        <form action={runDiscoveryAction} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="discovery-category"
              className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5"
            >
              Categoría
            </label>
            <select
              id="discovery-category"
              name="category"
              className="w-full text-[12px] border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            >
              {CATEGORY_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full text-[12px] font-semibold px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-colors"
          >
            Descubrir ahora
          </button>
        </form>

        <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
          Scraping de Amazon Best Sellers para la categoría seleccionada.
          Los candidatos validados se agregan al pool de discovery.
          Puede tardar 15–60 segundos.
        </p>
      </Card>
    </section>
  )
}
