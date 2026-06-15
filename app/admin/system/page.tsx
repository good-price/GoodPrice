import type { Metadata } from 'next'
import { readSiteMode }  from '@/lib/system/site-mode'
import { SiteModeToggle } from '@/components/admin/SiteModeToggle'
import { SectionHeader, Card } from '@/components/admin/shared'

export const dynamic  = 'force-dynamic'
export const metadata: Metadata = { title: 'Sistema — GOODPRICE Internal' }

const PUBLIC_ROUTES = [
  '/',
  '/categorias',
  '/categorias/[slug]',
  '/productos',
  '/productos/[asin]',
  '/ofertas',
  '/top-ventas',
]

const EXEMPT_ROUTES = [
  '/admin/*',
  '/api/health',
  '/api/readiness',
  '/en-desarrollo',
]

export default function SystemPage() {
  const state = readSiteMode()

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-base font-bold text-gray-900">
            <span className="text-[#F7A823]">GOOD</span>PRICE
            <span className="text-gray-300 font-light mx-2">/</span>
            <span className="text-gray-500 font-normal">Sistema</span>
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Control de acceso público al sitio
          </p>
        </div>
        <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-400 border border-gray-200">
          🔒 INTERNAL
        </span>
      </div>

      {/* Mode Control */}
      <section>
        <SectionHeader>Modo del sitio</SectionHeader>
        <Card>
          <p className="text-[11px] text-gray-400 mb-4">
            Controla si el sitio está abierto al público o en desarrollo.
            El cambio es inmediato — no requiere redeploy.
          </p>
          <SiteModeToggle currentMode={state.mode} />
          {state.updatedAt && (
            <div className="mt-4 pt-4 border-t border-gray-100 text-[10px] text-gray-400 space-y-0.5">
              <p>Último cambio: <span className="font-mono text-gray-500">{state.updatedAt}</span></p>
              {state.previousMode && (
                <p>Modo anterior: <span className="font-medium text-gray-500 uppercase">{state.previousMode}</span></p>
              )}
            </div>
          )}
        </Card>
      </section>

      {/* Affected routes */}
      <section>
        <SectionHeader>Rutas afectadas</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Redirigidas en DEVELOPMENT
            </p>
            <ul className="space-y-1">
              {PUBLIC_ROUTES.map(r => (
                <li key={r} className="text-[11px] font-mono text-gray-500">{r}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Siempre accesibles
            </p>
            <ul className="space-y-1">
              {EXEMPT_ROUTES.map(r => (
                <li key={r} className="text-[11px] font-mono text-green-600">{r}</li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

    </div>
  )
}
