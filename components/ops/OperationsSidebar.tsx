/**
 * components/ops/OperationsSidebar.tsx
 *
 * Navigation sidebar for the admin operations center.
 * Client component — tracks active section via URL hash or prop.
 *
 * Currently visual-only (anchor links to section IDs on the admin page).
 * Will migrate to separate routes as the admin surface grows.
 *
 * 'use client' — needed for active-link highlighting based on scroll position.
 */

'use client'

import { useEffect, useState } from 'react'

// ── Nav items ─────────────────────────────────────────────────────────────────

interface NavItem {
  id:    string
  label: string
  icon:  string
  href:  string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',  label: 'Dashboard',   icon: '◉', href: '#header' },
  { id: 'catalog',    label: 'Catálogo',    icon: '📦', href: '#catalog-section' },
  { id: 'validation', label: 'Validación',  icon: '✓',  href: '#validation-section' },
  { id: 'repair',     label: 'Repair',      icon: '🔧', href: '#repair-section' },
  { id: 'healing',    label: 'Self-Healing', icon: '💚', href: '#healing-section' },
  { id: 'analytics',  label: 'Analytics',   icon: '📊', href: '#analytics-section' },
  { id: 'operations', label: 'Operaciones', icon: '⚡', href: '#ops-section' },
  { id: 'logs',       label: 'Logs',        icon: '📋', href: '#logs-section' },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** Currently active section — controlled externally (e.g. from URL hash). */
  activeSection?: string
}

export function OperationsSidebar({ activeSection }: Props) {
  const [active, setActive] = useState(activeSection ?? 'dashboard')

  // Update active on hash change
  useEffect(() => {
    function onHashChange() {
      const hash    = window.location.hash.replace('#', '')
      const matched = NAV_ITEMS.find(n => n.href === `#${hash}`)
      if (matched) setActive(matched.id)
    }
    window.addEventListener('hashchange', onHashChange)
    onHashChange()
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <nav className="w-48 flex-shrink-0 space-y-0.5" aria-label="Ops navigation">
      {/* Brand */}
      <div className="px-3 py-2 mb-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          Operaciones
        </p>
      </div>

      {NAV_ITEMS.map(item => {
        const isActive = active === item.id
        return (
          <a
            key={item.id}
            href={item.href}
            onClick={() => setActive(item.id)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive
                ? 'bg-gray-900 text-white font-medium'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            <span className="text-base leading-none w-5 text-center">{item.icon}</span>
            <span>{item.label}</span>
          </a>
        )
      })}

      {/* Status indicator */}
      <div className="px-3 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[10px] text-gray-400">Sistema activo</span>
        </div>
      </div>
    </nav>
  )
}
