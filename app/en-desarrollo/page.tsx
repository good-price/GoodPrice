import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'En desarrollo — GOODPRICE',
  robots: { index: false, follow: false },
}

export default function EnDesarrolloPage() {
  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center px-6">

      {/* Logo */}
      <div className="mb-12 text-center">
        <span className="text-4xl font-black tracking-tight text-white">
          <span className="text-[#F7A823]">GOOD</span>PRICE
        </span>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-[#1a1f2e] rounded-2xl border border-white/10 p-10 text-center shadow-2xl">

        {/* Pulse indicator */}
        <div className="flex items-center justify-center mb-8">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F7A823] opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#F7A823]" />
          </span>
          <span className="ml-2.5 text-[11px] font-semibold text-[#F7A823] uppercase tracking-widest">
            En desarrollo
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-xl font-bold text-white mb-3 leading-snug">
          Estamos realizando mejoras<br />para ofrecer una mejor experiencia.
        </h1>

        {/* Body */}
        <p className="text-sm text-white/50 leading-relaxed mb-10">
          Nuestro catálogo y herramientas están siendo actualizados.
          <br />Volveremos pronto.
        </p>

        {/* OPS access */}
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-xs font-medium text-white/30 hover:text-white/60 transition-colors duration-150"
        >
          <span className="text-[10px]">🔒</span>
          Acceso OPS
        </Link>
      </div>

      {/* Footer */}
      <p className="mt-8 text-[11px] text-white/20">
        © {new Date().getFullYear()} GOODPRICE
      </p>
    </div>
  )
}
