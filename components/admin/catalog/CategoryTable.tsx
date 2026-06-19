/**
 * components/admin/catalog/CategoryTable.tsx
 *
 * Catalog Center — Zona 2: CATEGORY TABLE (editable)
 *
 * Tabla por categoría:
 *   Categoría | Actual | Mínimo (editable)
 *
 * Actual:     solo lectura.
 * Mínimo:     <input type="number"> — min=0, max=1000, sin decimales.
 *
 * Un solo formulario. Un solo botón "Guardar".
 * El Server Action detecta cambios y persiste category-config.json.
 *
 * Server Component — usa Server Action directamente en <form action>.
 */

import type { CategoryDeficit } from '@/lib/catalog/runtime'
import { saveCategoryConfigAction } from '@/lib/catalog/runtime/config-actions'
import { SectionHeader, Th, Td } from '@/components/admin/shared'

interface Props {
  deficits: CategoryDeficit[]
}

const CATEGORY_LABELS: Record<string, string> = {
  electronica:  'Electrónica',
  gaming:       'Gaming',
  hogar:        'Hogar',
  cocina:       'Cocina',
  deporte:      'Deporte',
  oficina:      'Oficina',
  belleza:      'Belleza',
  mascotas:     'Mascotas',
  bebes:        'Bebés',
  herramientas: 'Herramientas',
}

export function CategoryTable({ deficits }: Props) {
  const totalDeficit = deficits.reduce((sum, d) => sum + d.deficit, 0)

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <SectionHeader>Categorías</SectionHeader>
        {totalDeficit > 0 && (
          <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
            Déficit total: {totalDeficit}
          </span>
        )}
      </div>

      <form action={saveCategoryConfigAction}>
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm mb-3">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <Th>Categoría</Th>
                <Th>Actual</Th>
                <Th>Mínimo</Th>
              </tr>
            </thead>
            <tbody>
              {deficits.map(d => {
                const hasDeficit = d.deficit > 0
                const label = CATEGORY_LABELS[d.category] ?? d.category

                return (
                  <tr
                    key={d.category}
                    className={`border-b border-gray-50 last:border-0 ${hasDeficit ? 'bg-orange-50/40' : ''}`}
                  >
                    <Td>
                      <span className="capitalize font-medium">{label}</span>
                    </Td>
                    <Td>
                      <span className={hasDeficit ? 'text-orange-600 font-semibold' : 'text-green-600 font-semibold'}>
                        {d.current}
                      </span>
                    </Td>
                    <td className="py-1.5 pr-4">
                      <input
                        type="number"
                        name={d.category}
                        defaultValue={d.minimum}
                        min={0}
                        max={1000}
                        step={1}
                        className="w-20 text-right text-sm tabular-nums border border-gray-200 rounded-lg px-2 py-1
                                   focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300
                                   transition-colors bg-white text-gray-700"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="text-[12px] font-semibold px-5 py-2 bg-gray-900 text-white rounded-lg
                       hover:bg-gray-700 active:bg-gray-800 transition-colors"
          >
            Guardar
          </button>
        </div>
      </form>
    </section>
  )
}
