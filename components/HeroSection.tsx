import Link from 'next/link'
import { Tag, TrendingUp, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface HeroSectionProps {
  productCount: number
}

export function HeroSection({ productCount }: HeroSectionProps) {
  return (
    <section className="bg-gradient-to-br from-[#1a1f2e] to-[#2d3550] rounded-2xl p-6 md:p-10 text-white">
      <div className="max-w-2xl">

        <p className="text-[#F7A823] text-sm font-semibold uppercase tracking-widest mb-2">
          Curador de Amazon · Colombia
        </p>

        <h1 className="text-3xl md:text-4xl font-extrabold leading-tight mb-3">
          Productos de Amazon
          <br />
          <span className="text-[#F7A823]">verificados para Colombia.</span>
        </h1>

        <p className="text-gray-300 text-sm md:text-base mb-2 leading-relaxed">
          Seleccionamos productos con envío internacional confirmado,
          calificación verificada y precio convertido a pesos colombianos.
          Sin sorpresas en aduana.
        </p>

        <p className="text-gray-500 text-xs mb-6">
          {productCount} productos curados · TRM actualizada diariamente · Sin registro
        </p>

        <div className="flex flex-wrap gap-3">
          <Link href="/productos">
            <Button className="bg-[#F7A823] hover:bg-[#e8961a] text-black font-bold gap-2">
              <Tag className="h-4 w-4" />
              Ver todos los productos
            </Button>
          </Link>
          <Link href="/ofertas">
            <Button
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 hover:text-white gap-2 bg-transparent"
            >
              <TrendingUp className="h-4 w-4" />
              Ver ofertas
            </Button>
          </Link>
          <Link href="/seguimiento">
            <Button
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 hover:text-white gap-2 bg-transparent"
            >
              <Bell className="h-4 w-4" />
              Alertas de precio
            </Button>
          </Link>
        </div>

      </div>
    </section>
  )
}
