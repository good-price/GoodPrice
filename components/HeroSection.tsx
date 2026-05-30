import Link from 'next/link'
import { Bell, Tag, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function HeroSection() {
  return (
    <section className="bg-gradient-to-br from-[#1a1f2e] to-[#2d3550] rounded-2xl p-6 md:p-10 text-white">
      <div className="max-w-2xl">
        <p className="text-[#F7A823] text-sm font-semibold uppercase tracking-widest mb-2">
          Comparador de precios · Colombia
        </p>
        <h1 className="text-3xl md:text-4xl font-extrabold leading-tight mb-3">
          Amazon vs MercadoLibre.<br />
          <span className="text-[#F7A823]">Tú decides dónde comprar.</span>
        </h1>
        <p className="text-gray-300 text-sm md:text-base mb-2 leading-relaxed">
          Comparamos precios de Amazon y MercadoLibre Colombia en tiempo real.
          Activa alertas gratuitas — te avisamos cuando baje el precio que quieres.
        </p>
        <p className="text-gray-500 text-xs mb-6">
          Sin registro · Sin spam · 19 productos rastreados
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/ofertas">
            <Button className="bg-[#F7A823] hover:bg-[#e8961a] text-black font-bold gap-2">
              <Tag className="h-4 w-4" /> Ver ofertas
            </Button>
          </Link>
          <Link href="/top-ventas">
            <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 hover:text-white gap-2 bg-transparent">
              <TrendingUp className="h-4 w-4" /> Top ventas
            </Button>
          </Link>
          <Link href="/seguimiento">
            <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 hover:text-white gap-2 bg-transparent">
              <Bell className="h-4 w-4" /> Mis alertas
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
