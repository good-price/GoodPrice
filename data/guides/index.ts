/**
 * Guide registry for GOODPRICE content SEO.
 *
 * How to add a new guide:
 *   1. Create data/guides/your-slug.ts following the Guide interface
 *   2. Import it here and add it to GUIDES
 *   3. Update app/sitemap.ts is handled automatically (reads GUIDES)
 *
 * Content principles:
 *   - Every guide must reference at least one catalog product (productIds)
 *   - Content is authored in TypeScript — not auto-generated
 *   - dynamicParams = false in the route — unknown slugs 404
 */

import type { Guide } from '@/types'

// ── Registry ──────────────────────────────────────────────────────────────────
// Order here = display order on the /guias hub page

export const GUIDES: Guide[] = []

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find(g => g.slug === slug)
}

export function getGuidesByCategory(category: string): Guide[] {
  return GUIDES.filter(g => g.category === category)
}

export function getGuidesByType(type: Guide['type']): Guide[] {
  return GUIDES.filter(g => g.type === type)
}

/** All slugs — used by generateStaticParams */
export function getAllGuideSlugs(): string[] {
  return GUIDES.map(g => g.slug)
}
