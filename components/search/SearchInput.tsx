'use client'

import { useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  placeholder?: string
}

export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Buscar productos, categorías, guías…',
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Autofocus on mount — requestAnimationFrame avoids conflicts with
  // CSS open animations that might intercept focus events
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10">
      {/* Search icon */}
      <Search className="h-5 w-5 text-gray-400 flex-shrink-0" aria-hidden="true" />

      {/* Input */}
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Buscar en GOODPRICE"
        className={[
          'flex-1 bg-transparent text-white text-base placeholder:text-gray-500',
          'outline-none border-none ring-0 caret-amber-400',
          // Hide browser's default "clear" button on search inputs
          '[&::-webkit-search-cancel-button]:hidden',
        ].join(' ')}
      />

      {/* Clear button — only visible when there's text */}
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Borrar búsqueda"
          className="flex-shrink-0 rounded-md p-1 text-gray-500 hover:text-gray-300 hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
