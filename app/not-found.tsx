import Link from 'next/link'
import { Home, Search, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="mb-6">
        <span className="text-6xl font-black text-gray-200 select-none">404</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">
        Página no encontrada
      </h1>
      <p className="text-gray-500 text-sm max-w-sm mb-8">
        El producto o la página que buscas no existe o ya no está disponible en el catálogo.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/productos"
          className="inline-flex items-center gap-2 bg-[#F7A823] hover:bg-[#e8961a] text-black font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          <Search className="h-4 w-4" />
          Ver catálogo completo
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-5 py-2.5 rounded-xl text-sm border border-gray-200 transition-colors"
        >
          <Home className="h-4 w-4" />
          Ir al inicio
        </Link>
      </div>
      <Link
        href="/categorias"
        className="mt-6 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-amber-600 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Explorar categorías
      </Link>
    </div>
  )
}
