'use client'

/**
 * Search hooks for the GOODPRICE command palette.
 *
 * useCommandSearch   — debounced, scored, grouped search over the full index
 * useRecentSearches  — localStorage-persisted recent queries (max 5)
 * useDebounce        — generic debounce hook used internally
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { getSearchIndex } from '@/lib/search'
import { scoreItem } from '@/lib/search/fuzzy'
import type { SearchResultItem, SearchGroup, RecentSearch } from '@/lib/search/types'

// ── Config ────────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 120

/** Max items shown per group */
const GROUP_LIMITS: Record<string, number> = {
  product: 5,
  category: 4,
  guide: 3,
}

const GROUP_LABELS: Record<string, string> = {
  product: 'Productos',
  category: 'Categorías',
  guide: 'Guías',
}

const GROUP_ORDER = ['product', 'category', 'guide'] as const

// ── useCommandSearch ──────────────────────────────────────────────────────────

export interface CommandSearchResult {
  groups: SearchGroup[]
  totalCount: number
  isEmpty: boolean
}

/**
 * Primary search hook. Returns grouped, scored results for the given query.
 * Debounced at 120ms — fast enough to feel instant, cheap enough on mobile.
 */
export function useCommandSearch(query: string): CommandSearchResult {
  const debouncedQuery = useDebounce(query, DEBOUNCE_MS)

  // Build index once per session — useMemo with no deps = run once
  const index = useMemo(() => getSearchIndex(), [])

  return useMemo(() => {
    const q = debouncedQuery.trim()

    if (!q) {
      return { groups: [], totalCount: 0, isEmpty: true }
    }

    // ── Score all items ────────────────────────────────────────────────────────
    const scored: SearchResultItem[] = index
      .map(item => {
        const result = scoreItem(q, item.title, item.tags)
        return { ...item, score: result.score, matchRanges: result.matchRanges }
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)

    if (scored.length === 0) {
      return { groups: [], totalCount: scored.length, isEmpty: false }
    }

    // ── Group by kind (respecting display limits) ──────────────────────────────
    const buckets: Record<string, SearchResultItem[]> = {
      product: [], category: [], guide: [],
    }

    for (const item of scored) {
      const bucket = buckets[item.kind]
      if (bucket && bucket.length < (GROUP_LIMITS[item.kind] ?? 5)) {
        bucket.push(item)
      }
    }

    const groups: SearchGroup[] = GROUP_ORDER
      .filter(kind => buckets[kind].length > 0)
      .map(kind => ({
        kind,
        label: GROUP_LABELS[kind],
        items: buckets[kind],
      }))

    return { groups, totalCount: scored.length, isEmpty: false }
  }, [debouncedQuery, index])
}

// ── useRecentSearches ─────────────────────────────────────────────────────────

const RECENT_KEY = 'gp:searches:recent'
const MAX_RECENT = 5

function loadRecent(): RecentSearch[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as RecentSearch[]) : []
  } catch {
    return []
  }
}

function persistRecent(searches: RecentSearch[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(searches))
  } catch {
    // localStorage unavailable (private browsing, storage quota) — ignore
  }
}

export function useRecentSearches() {
  const [recent, setRecent] = useState<RecentSearch[]>([])

  // Load from localStorage on mount only (avoids hydration mismatch)
  useEffect(() => {
    setRecent(loadRecent())
  }, [])

  const addRecent = useCallback((query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return

    setRecent(prev => {
      const next: RecentSearch[] = [
        { query: trimmed, ts: Date.now() },
        ...prev.filter(r => r.query !== trimmed),
      ].slice(0, MAX_RECENT)
      persistRecent(next)
      return next
    })
  }, [])

  const removeRecent = useCallback((query: string) => {
    setRecent(prev => {
      const next = prev.filter(r => r.query !== query)
      persistRecent(next)
      return next
    })
  }, [])

  const clearRecent = useCallback(() => {
    setRecent([])
    persistRecent([])
  }, [])

  return { recent, addRecent, removeRecent, clearRecent }
}

// ── useDebounce ───────────────────────────────────────────────────────────────

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
