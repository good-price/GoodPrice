/**
 * Lightweight fuzzy search engine for GOODPRICE.
 *
 * No external dependencies — pure TypeScript.
 *
 * Scoring tiers:
 *   100  Exact match (full string equals query)
 *    90  Starts with query
 *    75  Contains query as exact substring
 *    65  Word-boundary match (starts after space or dash)
 *    55  All multi-word query words appear in title
 *    40  Match found in tags (de-ranked)
 *    20  Fuzzy character sequence (fallback)
 *     0  No match → item is excluded from results
 *
 * Highlighting uses the title's match ranges for the highest-tier match,
 * falling back gracefully when only tag or fuzzy matches are found.
 */

export interface FuzzyResult {
  score: number
  /** Character ranges within the TITLE string to highlight — [start, end) */
  matchRanges: [number, number][]
}

export interface HighlightPart {
  text: string
  highlight: boolean
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Score `query` against a single `SearchItem`'s title and tags.
 * Returns score = 0 if no match at all (item should be excluded).
 */
export function scoreItem(
  query: string,
  title: string,
  tags: string[],
): FuzzyResult {
  const q = query.toLowerCase().trim()
  if (!q) return { score: 0, matchRanges: [] }

  const t = title.toLowerCase()

  // ── Tier 1: exact ──────────────────────────────────────────────────────────
  if (t === q) {
    return { score: 100, matchRanges: [[0, title.length]] }
  }

  // ── Tier 2: starts with ────────────────────────────────────────────────────
  if (t.startsWith(q)) {
    return { score: 90, matchRanges: [[0, q.length]] }
  }

  // ── Tier 3: substring ──────────────────────────────────────────────────────
  const subIdx = t.indexOf(q)
  if (subIdx >= 0) {
    return { score: 75, matchRanges: [[subIdx, subIdx + q.length]] }
  }

  // ── Tier 4: word-boundary match ────────────────────────────────────────────
  const wbIdx = findWordBoundary(t, q)
  if (wbIdx >= 0) {
    return { score: 65, matchRanges: [[wbIdx, wbIdx + q.length]] }
  }

  // ── Tier 5: all multi-word query words found in title ─────────────────────
  const words = q.split(/\s+/).filter(w => w.length >= 2)
  if (words.length > 1) {
    const wordRanges = findAllWords(t, words)
    if (wordRanges !== null) {
      return { score: 55, matchRanges: wordRanges }
    }
  }

  // ── Tier 6: single word anywhere in title ─────────────────────────────────
  if (words.length === 1) {
    const wi = t.indexOf(words[0])
    if (wi >= 0) {
      return { score: 50, matchRanges: [[wi, wi + words[0].length]] }
    }
  }

  // ── Tier 7: tag match (lower weight, no title highlight) ──────────────────
  for (const tag of tags) {
    const tl = tag.toLowerCase()
    if (tl.includes(q) || words.every(w => tl.includes(w))) {
      return { score: 40, matchRanges: [] }
    }
  }

  // ── Tier 8: fuzzy character sequence ──────────────────────────────────────
  if (q.length >= 2 && isCharSequence(q, t)) {
    return { score: 20, matchRanges: [] }
  }

  return { score: 0, matchRanges: [] }
}

// ── Highlighting ──────────────────────────────────────────────────────────────

/**
 * Split `title` into highlighted and non-highlighted parts using
 * `matchRanges` from a FuzzyResult. Safe for direct React rendering.
 */
export function getHighlightParts(
  title: string,
  matchRanges: [number, number][],
): HighlightPart[] {
  if (matchRanges.length === 0) {
    return [{ text: title, highlight: false }]
  }

  const parts: HighlightPart[] = []
  let pos = 0

  // Sort and deduplicate ranges
  const sorted = [...matchRanges]
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])

  for (const [start, end] of sorted) {
    const clampedStart = Math.max(pos, start)
    const clampedEnd = Math.min(title.length, end)
    if (clampedStart >= clampedEnd) continue

    if (clampedStart > pos) {
      parts.push({ text: title.slice(pos, clampedStart), highlight: false })
    }
    parts.push({ text: title.slice(clampedStart, clampedEnd), highlight: true })
    pos = clampedEnd
  }

  if (pos < title.length) {
    parts.push({ text: title.slice(pos), highlight: false })
  }

  return parts.filter(p => p.text.length > 0)
}

// ── Internals ─────────────────────────────────────────────────────────────────

/** Find query after a word separator (space, dash, slash, parenthesis) */
function findWordBoundary(text: string, query: string): number {
  const separators = /[\s\-\/\(]/
  let idx = 0
  while (idx < text.length) {
    const nextIdx = text.indexOf(query, idx)
    if (nextIdx < 0) return -1
    if (nextIdx === 0 || separators.test(text[nextIdx - 1])) return nextIdx
    idx = nextIdx + 1
  }
  return -1
}

/** Check that all words appear in text; returns their ranges or null */
function findAllWords(text: string, words: string[]): [number, number][] | null {
  const ranges: [number, number][] = []
  for (const word of words) {
    const idx = text.indexOf(word)
    if (idx < 0) return null
    ranges.push([idx, idx + word.length])
  }
  return ranges
}

/** Check that all characters of query appear in text in order */
function isCharSequence(query: string, text: string): boolean {
  let qi = 0
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) qi++
  }
  return qi === query.length
}
