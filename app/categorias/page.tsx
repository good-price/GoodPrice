import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { readSiteMode } from '@/lib/system/site-mode'
import Link from 'next/link'
import { categories } from '@/data/categories'
import { products } from '@/data/products'
import { buildCategoriesIndexMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildCategoriesIndexMetadata()

export default function CategoriasPage() {
  const { mode } = readSiteMode()
  if (mode === 'development') redirect('/en-desarrollo')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Todas las categorías</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {categories.map(cat => {
          const count = products.filter(p => p.category === cat.slug).length
          return (
            <Link
              key={cat.id}
              href={`/categorias/${cat.slug}`}
              className="flex flex-col items-center gap-3 bg-white rounded-2xl border border-gray-100 p-6 hover:border-[#F7A823] hover:shadow-md transition-all duration-200 group"
            >
              <span className="text-4xl">{cat.icon}</span>
              <div className="text-center">
                <p className="font-semibold text-gray-800 group-hover:text-[#e8961a]">{cat.name}</p>
                {count > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{count} producto{count !== 1 ? 's' : ''}</p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
