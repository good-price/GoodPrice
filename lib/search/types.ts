/**
 * Core types for GOODPRICE's unified search system.
 *
 * The search index is a flat array of SearchItems (products + categories + guides).
 * During a search pass each item gets a score and match ranges for highlight rendering.
 * Results are grouped by kind before display.
 */

export type SearchItemKind = 'product' | 'category' | 'guide'

// ── Index item (stored) ───────────────────────────────────────────────────────

export interface SearchItem {
  kind: SearchItemKind
  /** Stable unique key across the full index */
  id: string
  /** Primary display text — also the main match target */
  title: string
  /** Secondary display line (price, product count, headline) */
  subtitle: string
  /** Emoji — categories and guides */
  icon?: string
  /** Thumbnail URL — products only */
  image?: string
  /** Navigation target on selection */
  href: string
  /** Optional chip label (badge, year, type) */
  badge?: string
  /** Extra strings included in matching but not displayed prominently */
  tags: string[]
}

// ── Search result item (scored) ───────────────────────────────────────────────

export interface SearchResultItem extends SearchItem {
  /** 0–100 — higher = better match */
  score: number
  /** Character ranges in `title` to highlight — [startIndex, endIndex) */
  matchRanges: [number, number][]
}

export interface SearchGroup {
  kind: SearchItemKind
  /** Section header label */
  label: string
  items: SearchResultItem[]
}

// ── Recent search ─────────────────────────────────────────────────────────────

export interface RecentSearch {
  query: string
  /** Date.now() at the time of the search */
  ts: number
}
