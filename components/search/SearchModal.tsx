'use client'

/**
 * SearchModal — Full-screen command palette overlay.
 *
 * Design: premium dark glassmorphism panel, gold/emerald accents.
 * Animations: CSS transitions via tailwindcss-animate (no extra dependency).
 * Portal: rendered at document.body to escape sticky Navbar z-index context.
 * Accessibility: role="dialog", aria-modal, focus trap, keyboard navigation.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { SearchInput } from './SearchInput'
import { SearchResults } from './SearchResults'
import { useCommandSearch, useRecentSearches } from '@/hooks/useCommandSearch'
import { ga4Event } from '@/lib/analytics/ga4'

// ── Props ─────────────────────────────────────────────────────────────────────

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
}

// ── Keyboard shortcuts footer ─────────────────────────────────────────────────

function ShortcutHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1 text-gray-600 text-xs">
      {keys.map(k => (
        <kbd
          key={k}
          className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-white/8 border border-white/10 text-gray-400 text-[10px] font-mono leading-none"
        >
          {k}
        </kbd>
      ))}
      <span className="ml-0.5">{label}</span>
    </span>
  )
}

// ── Modal panel ───────────────────────────────────────────────────────────────

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const resultsRef = useRef<HTMLDivElement>(null)
  const lastNoResultQuery = useRef('')

  const { groups, totalCount, isEmpty } = useCommandSearch(query)
  const noResults = !isEmpty && groups.length === 0
  const { recent, addRecent, removeRecent, clearRecent } = useRecentSearches()

  // Flatten all result items for keyboard navigation
  const flatItems = groups.flatMap(g => g.items)
  const totalItems = flatItems.length

  // ── Animation lifecycle ──────────────────────────────────────────────────────
  // Mount → animate in. Close → animate out → unmount.

  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    } else {
      setVisible(false)
      const t = setTimeout(() => {
        setMounted(false)
        setQuery('')
        setSelectedIndex(0)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll active item into view
  useEffect(() => {
    const el = resultsRef.current?.querySelector('[aria-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // ── Event handlers ────────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (href: string, currentQuery: string) => {
      if (currentQuery.trim()) {
        addRecent(currentQuery.trim())
        ga4Event('search', {
          search_term:     currentQuery.trim(),
          result_count:    totalCount,
          selected_result: href,
        })
      }
      onClose()
      router.push(href)
    },
    [addRecent, onClose, router, totalCount],
  )

  useEffect(() => {
    if (noResults && query.trim().length >= 3 && query.trim() !== lastNoResultQuery.current) {
      lastNoResultQuery.current = query.trim()
      ga4Event('no_results_search', { search_term: query.trim() })
    }
    if (!noResults) lastNoResultQuery.current = ''
  }, [noResults, query])

  const handleQuerySelect = useCallback((q: string) => {
    setQuery(q)
    setSelectedIndex(0)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          onClose()
          break

        case 'ArrowDown':
          e.preventDefault()
          if (totalItems > 0) {
            setSelectedIndex(i => (i + 1) % totalItems)
          }
          break

        case 'ArrowUp':
          e.preventDefault()
          if (totalItems > 0) {
            setSelectedIndex(i => (i - 1 + totalItems) % totalItems)
          }
          break

        case 'Enter':
          e.preventDefault()
          if (totalItems > 0 && flatItems[selectedIndex]) {
            handleSelect(flatItems[selectedIndex].href, query)
          } else if (query.trim()) {
            // Fallback: navigate to full-text search page
            handleSelect(`/productos?q=${encodeURIComponent(query.trim())}`, query)
          }
          break

        default:
          break
      }
    },
    [totalItems, flatItems, selectedIndex, query, handleSelect, onClose],
  )

  // ── Portal guard ──────────────────────────────────────────────────────────────
  if (!mounted) return null

  const modal = (
    // Outer backdrop — click to dismiss
    <div
      role="presentation"
      aria-hidden={!visible}
      onClick={onClose}
      className={[
        'fixed inset-0 z-[9999] flex items-start justify-center px-4 pt-[12vh] pb-8',
        'bg-gray-950/80 backdrop-blur-sm',
        'transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      {/* Panel — stop click propagation so clicking inside doesn't close */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className={[
          'relative w-full max-w-2xl rounded-2xl overflow-hidden',
          'bg-gray-900 border border-white/10',
          'shadow-2xl shadow-black/60',
          // Subtle gradient overlay for depth
          'ring-1 ring-white/5',
          'transition-all duration-200',
          visible
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 -translate-y-2',
        ].join(' ')}
        // Max height: viewport - top padding - bottom padding
        style={{ maxHeight: 'calc(100vh - 15vh - 4rem)' }}
      >
        {/* Subtle glow at top of panel */}
        <div
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"
          aria-hidden="true"
        />

        {/* Input row */}
        <SearchInput
          value={query}
          onChange={val => {
            setQuery(val)
            setSelectedIndex(0)
          }}
          onClear={() => {
            setQuery('')
            setSelectedIndex(0)
          }}
        />

        {/* Results area — scrollable */}
        <div
          ref={resultsRef}
          className="overflow-y-auto overscroll-contain"
          style={{ maxHeight: 'calc(100vh - 15vh - 4rem - 56px - 40px)' }}
        >
          <SearchResults
            groups={groups}
            query={query}
            isEmpty={isEmpty}
            noResults={noResults}
            totalCount={totalCount}
            selectedIndex={selectedIndex}
            onSelect={handleSelect}
            onHover={setSelectedIndex}
            recent={recent}
            onClearRecent={clearRecent}
            onRemoveRecent={removeRecent}
            onQuerySelect={handleQuerySelect}
          />
        </div>

        {/* Footer: keyboard shortcuts */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-white/8 bg-black/20">
          <ShortcutHint keys={['↑', '↓']} label="navegar" />
          <ShortcutHint keys={['↵']} label="abrir" />
          <ShortcutHint keys={['Esc']} label="cerrar" />
          <div className="ml-auto">
            <ShortcutHint keys={['⌘', 'K']} label="abrir/cerrar" />
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
