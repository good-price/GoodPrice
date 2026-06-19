/**
 * components/admin/AdminShell.tsx
 *
 * Administrative layout shell — sidebar with grouped navigation,
 * header with breadcrumbs, live health indicator, and command palette.
 *
 * Sidebar groups:
 *   OPERACIÓN  — Dashboard · Operaciones
 *   CATÁLOGO   — Catálogo · Auditoría
 *   DATOS      — Imágenes · Pricing · Analytics
 *
 * 'use client' — navigation state + command palette.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link               from 'next/link'
import { CommandPalette }    from '@/components/ops/CommandPalette'
import { LiveExecutionFeed } from '@/components/ops/LiveExecutionFeed'
import type { LiveEvent } from '@/lib/ops/workspace/types'

// ── Nav groups ────────────────────────────────────────────────────────────────

interface NavItem {
  href:    string
  label:   string
  icon:    string
  segment: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'OPERACIÓN',
    items: [
      { href: '/admin',     label: 'Dashboard',   icon: '◉', segment: '' },
      { href: '/admin/ops', label: 'Operaciones',  icon: '⟳', segment: 'ops' },
    ],
  },
  {
    label: 'CATÁLOGO',
    items: [
      { href: '/admin/catalog', label: 'Catálogo',  icon: '▤', segment: 'catalog' },
      { href: '/admin/audit',   label: 'Auditoría', icon: '✓', segment: 'audit' },
    ],
  },
  {
    label: 'DATOS',
    items: [
      { href: '/admin/images',    label: 'Imágenes',  icon: '⚙', segment: 'images' },
      { href: '/admin/pricing',   label: 'Pricing',   icon: '◈', segment: 'pricing' },
      { href: '/admin/analytics', label: 'Analytics', icon: '▲', segment: 'analytics' },
    ],
  },
]

const BREADCRUMB_LABELS: Record<string, string> = {
  '':        'Dashboard',
  ops:       'Operaciones',
  catalog:   'Catálogo',
  audit:     'Auditoría',
  images:    'Imágenes',
  pricing:   'Pricing',
  analytics: 'Analytics',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  children:       React.ReactNode
  systemOk?:      boolean
  healthScore?:   number
  initialEvents?: LiveEvent[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminShell({
  children,
  systemOk      = true,
  healthScore   = 0,
  initialEvents = [],
}: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const handleLogout = useCallback(async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    router.push('/admin/login')
  }, [router])

  const segment      = pathname.replace('/admin', '').replace('/', '') || ''
  const currentLabel = BREADCRUMB_LABELS[segment] ?? segment

  // Ctrl+K shortcut
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen(p => !p) }
      if (e.key === 'Escape' && paletteOpen) setPaletteOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [paletteOpen])

  const navigateSection = useCallback((path: string) => {
    router.push(path)
    setPaletteOpen(false)
  }, [router])

  const healthColor =
    healthScore >= 70 ? 'text-green-600' :
    healthScore >= 40 ? 'text-yellow-600' :
    'text-red-500'

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className={`
        flex-shrink-0 flex flex-col bg-white border-r border-gray-200
        transition-all duration-200
        ${sidebarOpen ? 'w-52' : 'w-14'}
      `}>

        {/* Brand */}
        <div className="flex items-center h-14 px-4 border-b border-gray-100 flex-shrink-0">
          {sidebarOpen ? (
            <span className="text-sm font-bold text-gray-900">
              <span className="text-[#F7A823]">GOOD</span>PRICE
              <span className="ml-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Internal</span>
            </span>
          ) : (
            <span className="text-[#F7A823] font-black text-base">G</span>
          )}
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              {/* Group label — hidden when sidebar collapsed */}
              {sidebarOpen && (
                <p className="px-2.5 mb-1 text-[9px] font-bold text-gray-300 uppercase tracking-widest select-none">
                  {group.label}
                </p>
              )}

              {/* Group divider when collapsed */}
              {!sidebarOpen && (
                <div className="mx-2 mb-1 border-t border-gray-100" />
              )}

              <div className="space-y-0.5">
                {group.items.map(item => {
                  const isActive = segment === item.segment
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={!sidebarOpen ? item.label : undefined}
                      className={[
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-100',
                        isActive
                          ? 'bg-gray-100 text-gray-900 font-semibold'
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50',
                      ].join(' ')}
                    >
                      <span className={`text-base flex-shrink-0 w-5 text-center ${isActive ? 'text-[#F7A823]' : 'text-gray-400'}`}>
                        {item.icon}
                      </span>
                      {sidebarOpen && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="flex-shrink-0 border-t border-gray-100 p-2">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="w-full flex items-center justify-center h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-sm"
            title={sidebarOpen ? 'Colapsar sidebar' : 'Expandir sidebar'}
          >
            {sidebarOpen ? '‹' : '›'}
          </button>
        </div>
      </aside>

      {/* ── Main column ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className="h-14 flex-shrink-0 flex items-center gap-4 px-6 bg-white border-b border-gray-200">

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1">
            <Link
              href="/admin"
              className="text-gray-400 hover:text-gray-700 font-medium transition-colors flex-shrink-0"
            >
              Internal
            </Link>
            {segment && (
              <>
                <span className="text-gray-300 flex-shrink-0">/</span>
                <span className="text-gray-900 font-semibold truncate">{currentLabel}</span>
              </>
            )}
          </div>

          {/* Right: health + system status + Ctrl+K */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* System status pill */}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium ${systemOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${systemOk ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
              {systemOk ? 'Operacional' : 'Degradado'}
            </div>

            {/* Health score */}
            {healthScore > 0 && (
              <span className={`text-[11px] font-bold tabular-nums ${healthColor}`}>
                {healthScore}/100
              </span>
            )}

            {/* Ctrl+K */}
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 transition-all text-xs text-gray-500 hover:text-gray-800"
              title="Command palette (Ctrl+K)"
            >
              <span>⌘</span><span>K</span>
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
              title="Cerrar sesión"
            >
              Salir
            </button>
          </div>
        </header>

        {/* Scrollable main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-6 pb-20">
            {children}
          </div>
        </main>
      </div>

      {/* Command palette overlay */}
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onNavigate={navigateSection}
        />
      )}

      {/* Live execution feed */}
      <LiveExecutionFeed initialEvents={initialEvents} />
    </div>
  )
}
