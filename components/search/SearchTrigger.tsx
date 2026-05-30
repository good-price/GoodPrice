'use client'

import { Search } from 'lucide-react'

interface SearchTriggerProps {
  onClick: () => void
  /** Extra className — used to control layout (e.g. flex-1) */
  className?: string
}

/**
 * Desktop trigger — a fake search "input" that opens the command palette.
 * Deliberately looks like an input but behaves as a button.
 */
export function SearchTrigger({ onClick, className = '' }: SearchTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir búsqueda global (⌘K)"
      className={[
        'group flex items-center gap-2.5 w-full',
        'px-3 h-10 rounded-lg',
        'bg-white/8 hover:bg-white/12 border border-white/12 hover:border-white/20',
        'text-gray-400 hover:text-gray-300',
        'transition-all duration-150',
        'ring-0 focus-visible:ring-2 focus-visible:ring-amber-500/60 outline-none',
        className,
      ].join(' ')}
    >
      <Search className="h-4 w-4 flex-shrink-0 text-gray-500 group-hover:text-gray-400 transition-colors" aria-hidden="true" />
      <span className="flex-1 text-sm text-left truncate">
        Buscar productos, guías…
      </span>
      {/* Keyboard shortcut hint */}
      <span className="hidden lg:flex items-center gap-0.5 flex-shrink-0" aria-label="Atajo de teclado Cmd K">
        <kbd className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/10 border border-white/15 text-[10px] font-mono text-gray-500">
          ⌘
        </kbd>
        <kbd className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/10 border border-white/15 text-[10px] font-mono text-gray-500">
          K
        </kbd>
      </span>
    </button>
  )
}
