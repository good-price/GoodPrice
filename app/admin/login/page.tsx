/**
 * app/admin/login/page.tsx
 *
 * Admin login page — renders as a fixed full-screen overlay so it
 * visually covers the AdminShell rendered by app/admin/layout.tsx.
 *
 * Flow:
 *   1. Middleware redirects unauthenticated /admin/* requests here
 *      with ?next=<original-path>
 *   2. User submits the form → POST /api/admin/auth
 *   3. On success: session cookie is set → redirect to ?next
 *   4. On failure: redirect back here with ?error=1
 *
 * Server Component — no client-side JS needed (plain HTML form).
 */

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Acceso — GOODPRICE Internal' }

interface Props {
  searchParams: { error?: string; next?: string }
}

export default function LoginPage({ searchParams }: Props) {
  const hasError = searchParams.error === '1'
  const next     = searchParams.next ?? '/admin'

  return (
    /*
     * Fixed overlay at z-[99999] — sits above the AdminShell (z-[9999])
     * rendered by app/admin/layout.tsx. The layout still executes its
     * health-check reads (harmless), but is never visible to the user.
     */
    <div className="fixed inset-0 z-[99999] bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-sm px-4">

        {/* ── Brand ────────────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <p className="text-2xl font-black tracking-tight">
            <span className="text-[#F7A823]">GOOD</span>PRICE
          </p>
          <p className="text-[11px] text-gray-400 mt-1 uppercase tracking-widest font-medium">
            Internal
          </p>
        </div>

        {/* ── Card ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <h1 className="text-sm font-semibold text-gray-900 mb-6">
            Acceso al panel
          </h1>

          {/* Error message */}
          {hasError && (
            <div className="mb-5 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100
                            text-xs text-red-700 font-medium">
              Usuario o contraseña incorrectos. Verifica tus credenciales.
            </div>
          )}

          {/* Login form — plain POST, no JS required */}
          <form
            action="/api/admin/auth"
            method="POST"
            className="space-y-4"
          >
            {/* Preserve original destination */}
            <input type="hidden" name="next" value={next} />

            <div>
              <label
                htmlFor="lp-username"
                className="block text-xs font-medium text-gray-600 mb-1.5"
              >
                Usuario
              </label>
              <input
                id="lp-username"
                name="username"
                type="text"
                autoComplete="username"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                required
                placeholder="good_price"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white
                           placeholder:text-gray-300
                           focus:outline-none focus:ring-2 focus:ring-[#F7A823]/30 focus:border-[#F7A823]
                           transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="lp-password"
                className="block text-xs font-medium text-gray-600 mb-1.5"
              >
                Contraseña
              </label>
              <input
                id="lp-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••••"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white
                           placeholder:text-gray-300
                           focus:outline-none focus:ring-2 focus:ring-[#F7A823]/30 focus:border-[#F7A823]
                           transition-all"
              />
            </div>

            <button
              type="submit"
              className="w-full mt-2 py-2.5 px-4 text-sm font-semibold text-white
                         bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Entrar
            </button>
          </form>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <p className="text-center text-[10px] text-gray-400 mt-5">
          Acceso protegido · Solo personal autorizado
        </p>

      </div>
    </div>
  )
}
