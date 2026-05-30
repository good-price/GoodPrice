/**
 * Unified search index for GOODPRICE.
 *
 * Combines five data sources into a single flat array of SearchItems:
 *   - Products        → from getColombiaProducts() (catalog, Colombia-filtered)
 *   - Categories      → from categories static array
 *   - Guides          → from GUIDES registry
 *   - Mejores pages   → from MEJORES_PAGES programmatic registry
 *   - Comparar pages  → from COMPARAR_PAGES programmatic registry
 *
 * The index is lazily built and cached at module level on the client
 * (one build per browser session, rebuilt on next page load).
 *
 * All source functions are pure TypeScript with no server-only APIs,
 * so this module is safe to import in 'use client' components.
 */

import { getColombiaProducts } from '@/data/catalog'
import { categories } from '@/data/categories'
import { GUIDES } from '@/data/guides'
import { CATEGORY_PAGES } from '@/data/category-pages'
import { MEJORES_PAGES } from '@/data/programmatic/mejores'
import { COMPARAR_PAGES } from '@/data/programmatic/comparar'
import type { SearchItem } from './types'

// ── Index builder ─────────────────────────────────────────────────────────────

function buildSearchIndex(): SearchItem[] {
  const items: SearchItem[] = []

  // ── Products ────────────────────────────────────────────────────────────────
  for (const p of getColombiaProducts()) {
    const priceStr = `$${p.price.toFixed(2)}`
    const discountStr = p.oldPrice
      ? ` · antes $${p.oldPrice.toFixed(2)}`
      : ''

    items.push({
      kind: 'product',
      id: `product-${p.id}`,
      title: p.title,
      subtitle: `${priceStr}${discountStr}`,
      image: p.image,
      href: p.asin ? `/productos/${p.asin}` : '/productos',
      badge: p.badge,
      tags: [
        p.brand ?? '',
        p.category,
        p.isOffer ? 'oferta descuento rebaja' : '',
        p.isTopSeller ? 'top ventas popular bestseller' : '',
        p.badge ?? '',
        p.asin ?? '',
      ].filter(Boolean),
    })
  }

  // ── Categories ──────────────────────────────────────────────────────────────
  for (const cat of categories) {
    items.push({
      kind: 'category',
      id: `category-${cat.id}`,
      title: cat.name,
      subtitle: `${cat.count ?? 0} productos`,
      icon: cat.icon,
      href: `/categorias/${cat.slug}`,
      tags: [cat.name, cat.slug, 'categoria'],
    })
  }

  // ── Guides ──────────────────────────────────────────────────────────────────
  for (const guide of GUIDES) {
    items.push({
      kind: 'guide',
      id: `guide-${guide.slug}`,
      title: guide.title,
      subtitle: guide.headline,
      href: `/guias/${guide.slug}`,
      badge: guide.badge,
      tags: [
        ...guide.keywords,
        guide.type,
        guide.category,
        'guia compra comparativa lista',
      ],
    })
  }

  // ── Category landing pages ───────────────────────────────────────────────────
  // Indexed as 'guide' kind (same dark card style) — they're editorial content
  for (const cat of CATEGORY_PAGES) {
    items.push({
      kind: 'guide',
      id: `catpage-${cat.slug}`,
      title: cat.name,
      subtitle: cat.tagline,
      icon: cat.icon,
      href: `/categoria/${cat.slug}`,
      badge: cat.badge,
      tags: [
        ...cat.keywords,
        cat.name,
        cat.slug,
        'categoria landing faq guia',
        ...cat.trendingQueries,
      ],
    })
  }

  // ── Mejores pages ────────────────────────────────────────────────────────────
  // Indexed as 'guide' kind — editorial "best of" pages
  for (const p of MEJORES_PAGES) {
    items.push({
      kind: 'guide',
      id: `mejores-${p.slug}`,
      title: p.title,
      subtitle: p.tagline,
      href: `/mejores/${p.slug}`,
      badge: p.badge,
      tags: [
        ...p.keywords,
        p.slug,
        'mejores top seleccion recomendados amazon colombia',
      ],
    })
  }

  // ── Comparar pages ───────────────────────────────────────────────────────────
  // Indexed as 'guide' kind — product comparison articles
  for (const p of COMPARAR_PAGES) {
    items.push({
      kind: 'guide',
      id: `comparar-${p.slug}`,
      title: p.title,
      subtitle: `Comparativa · ${p.comparisonRows.length} criterios`,
      href: `/comparar/${p.slug}`,
      badge: 'vs',
      tags: [
        ...p.keywords,
        p.slug,
        'comparar vs comparativa diferencia cual mejor',
      ],
    })
  }

  return items
}

// ── Module-level singleton ────────────────────────────────────────────────────
// Safe on the client — rebuilt once per browser session.

let _cachedIndex: SearchItem[] | null = null

export function getSearchIndex(): SearchItem[] {
  if (!_cachedIndex) {
    _cachedIndex = buildSearchIndex()
  }
  return _cachedIndex
}

/** Invalidate the cached index (for hot-reload in dev) */
export function invalidateSearchIndex(): void {
  _cachedIndex = null
}

// ── Trending quick-links ──────────────────────────────────────────────────────
// Curated list of discovery entry-points shown when the search is empty.
// These are direct navigation items, not query results.

export interface TrendingLink {
  label: string
  icon: string
  href: string
  kind: SearchItem['kind']
}

export const TRENDING_LINKS: TrendingLink[] = [
  { label: 'Electrónica',  icon: '💻', href: '/categorias/electronica', kind: 'category' },
  { label: 'Gaming',       icon: '🎮', href: '/categorias/gaming',      kind: 'category' },
  { label: 'Hogar',        icon: '🏠', href: '/categorias/hogar',       kind: 'category' },
  { label: 'Oficina',      icon: '🖊️', href: '/categorias/oficina',     kind: 'category' },
  { label: 'Ofertas',      icon: '🔥', href: '/ofertas',                kind: 'category' },
  { label: 'Top ventas',   icon: '🏆', href: '/top-ventas',             kind: 'category' },
]

export const TRENDING_QUERIES = [
  'auriculares', 'gaming', 'kindle', 'cargador', 'smart home',
]
