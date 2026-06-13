import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

export function Footer() {
  return (
    <footer className="bg-[#1a1f2e] text-gray-400 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">

          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <span className="text-white font-extrabold text-lg block mb-2">
              GOOD<span className="text-[#F7A823]">PRICE</span>
            </span>
            <p className="text-xs leading-relaxed mb-3">
              Curador de productos Amazon para Colombia. Solo artículos con envío
              internacional confirmado, calificación verificada y precio en pesos.
            </p>
            <p className="text-[10px] text-gray-600 leading-relaxed">
              Como afiliado de Amazon, ganamos comisión por compras calificadas
              sin costo extra para ti.
            </p>
          </div>

          {/* Explorar */}
          <div>
            <h3 className="text-white text-sm font-semibold mb-3">Explorar</h3>
            <ul className="flex flex-col gap-2 text-xs">
              <li><Link href="/categorias"  className="hover:text-[#F7A823] transition-colors">Categorías</Link></li>
              <li><Link href="/ofertas"     className="hover:text-[#F7A823] transition-colors">Ofertas</Link></li>
              <li><Link href="/top-ventas"  className="hover:text-[#F7A823] transition-colors">Top ventas</Link></li>
              <li><Link href="/productos"   className="hover:text-[#F7A823] transition-colors">Todos los productos</Link></li>
              <li><Link href="/seguimiento" className="hover:text-[#F7A823] transition-colors">Mis alertas</Link></li>
            </ul>
          </div>

          {/* Categorías */}
          <div>
            <h3 className="text-white text-sm font-semibold mb-3">Categorías</h3>
            <ul className="flex flex-col gap-2 text-xs">
              <li><Link href="/categorias/electronica" className="hover:text-[#F7A823] transition-colors">Electrónica</Link></li>
              <li><Link href="/categorias/gaming"      className="hover:text-[#F7A823] transition-colors">Gaming</Link></li>
              <li><Link href="/categorias/hogar"       className="hover:text-[#F7A823] transition-colors">Hogar</Link></li>
              <li><Link href="/categorias/cocina"      className="hover:text-[#F7A823] transition-colors">Cocina</Link></li>
              <li><Link href="/categorias/deportes"    className="hover:text-[#F7A823] transition-colors">Deportes</Link></li>
            </ul>
          </div>

          {/* Info */}
          <div>
            <h3 className="text-white text-sm font-semibold mb-3">Info</h3>
            <ul className="flex flex-col gap-2 text-xs">
              <li>
                <Link href="/metodologia" className="hover:text-[#F7A823] transition-colors">
                  Cómo funciona
                </Link>
              </li>
              <li>
                <Link href="/metodologia#afiliados" className="hover:text-[#F7A823] transition-colors">
                  Política de afiliados
                </Link>
              </li>
              <li>
                <Link href="/metodologia#alertas" className="hover:text-[#F7A823] transition-colors">
                  Cómo funcionan las alertas
                </Link>
              </li>
              <li>
                <a
                  href="https://www.amazon.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#F7A823] transition-colors flex items-center gap-1"
                >
                  Amazon.com <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <p className="text-gray-500">
            © {new Date().getFullYear()} GOODPRICE · Plataforma independiente de comparación de precios
          </p>
          <div className="flex items-center gap-5 text-center">
            <p className="text-gray-600">
              Precios referenciales · Verifica siempre antes de comprar ·{' '}
              <Link href="/metodologia" className="hover:text-[#F7A823] transition-colors underline underline-offset-2">
                Ver metodología
              </Link>
            </p>
            {/* Discreet operational access — intentionally low-emphasis */}
            <Link
              href="/admin"
              className="text-gray-700 hover:text-gray-500 transition-colors text-[10px] tracking-widest uppercase flex-shrink-0"
              aria-label="Acceso operacional"
            >
              Ops
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
