'use client'

import { useRouter } from 'next/navigation'
import { BookOpen, ChevronRight, Clock, Hash, TrendingUp, X } from 'lucide-react'
import { getHighlightParts } from '@/lib/search/fuzzy'
import { TRENDING_LINKS, TRENDING_QUERIES, type TrendingLink } from '@/lib/search'
import type { SearchGroup, SearchResultItem, RecentSearch } from '@/lib/search/types'

// ── Props ─────────────────────────────────────────────────────────────────────

interface SearchResultsProps {
  /** Grouped search results (empty when no query) */
  groups: SearchGroup[]
  /** Raw query string — used for text highlighting */
  query: string
  /** True when query is empty (show empty state) */
  isEmpty: boolean
  /** True when query produced no results */
  noResults: boolean
  /** Total untruncated match count */
  totalCount: number
  /** Keyboard-focused index across all result items */
  selectedIndex: number
  /** Called when an item is clicked or activated */
  onSelect: (href: string, query: string) => void
  /** Called on mouse-enter to sync selectedIndex */
  onHover: (flatIndex: number) => void
  recent: RecentSearch[]
  onClearRecent: () => void
  onRemoveRecent: (query: string) => void
  onQuerySelect: (query: string) => void
}

// ── Highlight component ───────────────────────────────────────────────────────

function HighlightedTitle({
  title,
  matchRanges,
}: {
  title: string
  matchRanges: [number, number][]
}) {
  const parts = getHighlightParts(title, matchRanges)
  return (
    <span>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark
            key={i}
            className="bg-transparent text-amber-400 font-semibold not-italic"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  )
}

// ── Kind icons ────────────────────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  product:  'text-amber-400',
  category: 'text-emerald-400',
  guide:    'text-blue-400',
}

function ItemIcon({ item }: { item: SearchResultItem }) {
  if (item.kind === 'product' && item.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.image}
        alt=""
        aria-hidden="true"
        className="w-8 h-8 object-contain rounded-md bg-white/5 flex-shrink-0"
        loading="lazy"
      />
    )
  }

  if (item.icon) {
    return (
      <span
        className={`w-8 h-8 flex items-center justify-center text-xl flex-shrink-0 ${KIND_COLORS[item.kind] ?? ''}`}
        aria-hidden="true"
      >
        {item.icon}
      </span>
    )
  }

  // Guide fallback
  return (
    <span className={`w-8 h-8 flex items-center justify-center flex-shrink-0 ${KIND_COLORS[item.kind] ?? ''}`}>
      <BookOpen className="h-4 w-4" aria-hidden="true" />
    </span>
  )
}

// ── Result item ───────────────────────────────────────────────────────────────

interface ResultItemProps {
  item: SearchResultItem
  flatIndex: number
  isSelected: boolean
  query: string
  onSelect: (href: string, query: string) => void
  onHover: (flatIndex: number) => void
}

function ResultItem({ item, flatIndex, isSelected, query, onSelect, onHover }: ResultItemProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onMouseEnter={() => onHover(flatIndex)}
      onClick={() => onSelect(item.href, query)}
      className={[
        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-75',
        'border-l-2',
        isSelected
          ? 'bg-amber-500/10 border-amber-500 text-white'
          : 'border-transparent text-gray-300 hover:bg-white/5 hover:text-white',
      ].join(' ')}
    >
      <ItemIcon item={item} />

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          <HighlightedTitle title={item.title} matchRanges={item.matchRanges} />
        </p>
        <p className="text-xs text-gray-500 truncate mt-0.5">{item.subtitle}</p>
      </div>

      {/* Right meta */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {item.badge && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
            {item.badge}
          </span>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-gray-600" aria-hidden="true" />
      </div>
    </button>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-4 py-1.5 sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
        {label}
      </span>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  recent: RecentSearch[]
  onClearRecent: () => void
  onRemoveRecent: (query: string) => void
  onQuerySelect: (query: string) => void
}

function EmptyState({ recent, onClearRecent, onRemoveRecent, onQuerySelect }: EmptyStateProps) {
  return (
    <div className="py-2">
      {/* Recent searches */}
      {recent.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-4 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Recientes
            </span>
            <button
              type="button"
              onClick={onClearRecent}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Borrar todo
            </button>
          </div>

          {recent.map(r => (
            <div key={r.query} className="flex items-center group">
              <button
                type="button"
                onClick={() => onQuerySelect(r.query)}
                className="flex-1 flex items-center gap-3 px-4 py-2 text-left text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Clock className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" aria-hidden="true" />
                {r.query}
              </button>
              <button
                type="button"
                onClick={() => onRemoveRecent(r.query)}
                aria-label={`Eliminar "${r.query}" de recientes`}
                className="pr-4 text-gray-600 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Trending quick links */}
      <div>
        <div className="px-4 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" aria-hidden="true" />
            Explorar
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1 px-3 pb-2">
          {TRENDING_LINKS.map((link: TrendingLink) => (
            <a
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/8 transition-colors border border-transparent hover:border-white/10"
            >
              <span className="text-base" aria-hidden="true">{link.icon}</span>
              {link.label}
            </a>
          ))}
        </div>

        {/* Trending queries */}
        <div className="px-4 py-2 flex items-center gap-2 flex-wrap">
          {TRENDING_QUERIES.map(q => (
            <button
              key={q}
              type="button"
              onClick={() => onQuerySelect(q)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] text-gray-500 bg-white/5 hover:bg-white/10 hover:text-gray-300 transition-colors border border-white/8"
            >
              <Hash className="h-2.5 w-2.5" aria-hidden="true" />
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── No results ────────────────────────────────────────────────────────────────

function NoResults({ query }: { query: string }) {
  const router = useRouter()

  return (
    <div className="py-12 text-center">
      <p className="text-4xl mb-3" aria-hidden="true">🔍</p>
      <p className="text-gray-300 font-medium mb-1">
        Sin resultados para &ldquo;{query}&rdquo;
      </p>
      <p className="text-gray-600 text-sm mb-4">
        Intenta con otra palabra o busca en el catálogo completo
      </p>
      <button
        type="button"
        onClick={() => router.push(`/productos?q=${encodeURIComponent(query)}`)}
        className="text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
      >
        Buscar &ldquo;{query}&rdquo; en todos los productos →
      </button>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function SearchResults({
  groups,
  query,
  isEmpty,
  noResults,
  totalCount,
  selectedIndex,
  onSelect,
  onHover,
  recent,
  onClearRecent,
  onRemoveRecent,
  onQuerySelect,
}: SearchResultsProps) {
  // Empty state (no query)
  if (isEmpty) {
    return (
      <EmptyState
        recent={recent}
        onClearRecent={onClearRecent}
        onRemoveRecent={onRemoveRecent}
        onQuerySelect={onQuerySelect}
      />
    )
  }

  // No results
  if (noResults) {
    return <NoResults query={query} />
  }

  // Compute flat index offsets for keyboard navigation
  let flatOffset = 0

  return (
    <div role="listbox" aria-label="Resultados de búsqueda">
      {groups.map(group => {
        const groupOffset = flatOffset
        flatOffset += group.items.length

        return (
          <div key={group.kind}>
            <SectionLabel label={group.label} />
            {group.items.map((item, i) => (
              <ResultItem
                key={item.id}
                item={item}
                flatIndex={groupOffset + i}
                isSelected={selectedIndex === groupOffset + i}
                query={query}
                onSelect={onSelect}
                onHover={onHover}
              />
            ))}
          </div>
        )
      })}

      {/* "See all" footer link when results are truncated */}
      {totalCount > groups.reduce((s, g) => s + g.items.length, 0) && (
        <div className="px-4 py-2 border-t border-white/5">
          <a
            href={`/productos?q=${encodeURIComponent(query)}`}
            className="text-xs text-gray-500 hover:text-amber-400 transition-colors"
          >
            Ver los {totalCount} resultados en el catálogo →
          </a>
        </div>
      )}
    </div>
  )
}
