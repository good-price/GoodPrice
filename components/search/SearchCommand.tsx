'use client'

/**
 * SearchCommand — Root orchestrator for GOODPRICE's global search.
 *
 * Responsibilities:
 *   - Owns the open/closed state
 *   - Registers the global Cmd/Ctrl+K keyboard shortcut
 *   - Renders the desktop trigger bar (hidden on mobile)
 *   - Renders the mobile icon trigger (hidden on desktop)
 *   - Renders the SearchModal (portaled to document.body)
 *
 * Drop this anywhere in a layout — it is fully self-contained.
 * The modal portal bypasses any CSS stacking context above it.
 *
 * Usage:
 *   <SearchCommand />
 *
 * To open programmatically from anywhere:
 *   window.dispatchEvent(new CustomEvent('gp:search:open'))
 */

import { useState, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'
import { SearchTrigger } from './SearchTrigger'
import { SearchModal } from './SearchModal'

export function SearchCommand() {
  const [open, setOpen] = useState(false)

  const openSearch = useCallback(() => setOpen(true), [])
  const closeSearch = useCallback(() => setOpen(false), [])

  // ── Global keyboard shortcut: Cmd/Ctrl + K ────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ── Custom event bridge (for external triggers) ───────────────────────────
  // Any component can dispatch window.dispatchEvent(new CustomEvent('gp:search:open'))
  useEffect(() => {
    window.addEventListener('gp:search:open', openSearch)
    return () => window.removeEventListener('gp:search:open', openSearch)
  }, [openSearch])

  return (
    <>
      {/* Desktop: full-width fake search bar — shown md+ */}
      <div className="hidden md:flex flex-1 mx-4 max-w-xl">
        <SearchTrigger onClick={openSearch} className="w-full" />
      </div>

      {/* Mobile: icon-only button — shown on small screens */}
      <button
        type="button"
        onClick={openSearch}
        aria-label="Abrir búsqueda (⌘K)"
        className={[
          'md:hidden flex-shrink-0',
          'flex items-center justify-center',
          'h-9 w-9 rounded-lg',
          'text-gray-300 hover:text-white',
          'hover:bg-white/10 active:bg-white/15',
          'transition-colors duration-150',
          'ring-0 focus-visible:ring-2 focus-visible:ring-amber-500/60 outline-none',
        ].join(' ')}
      >
        <Search className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Modal — portaled to document.body, always below in DOM order */}
      <SearchModal isOpen={open} onClose={closeSearch} />
    </>
  )
}
