import Link from 'next/link'
import { categories } from '@/data/categories'

export function CategoryGrid() {
  return (
    <section>
      <h2 className="text-xl font-bold text-gray-800 mb-4">Explorar categorías</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {categories.map(cat => (
          <Link
            key={cat.id}
            href={`/categorias/${cat.slug}`}
            className="flex flex-col items-center gap-2 bg-white rounded-xl border border-gray-100 p-3 hover:border-[#F7A823] hover:shadow-md transition-all duration-200 group"
          >
            <span className="text-2xl">{cat.icon}</span>
            <span className="text-xs font-medium text-gray-700 text-center leading-tight group-hover:text-[#e8961a]">
              {cat.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
