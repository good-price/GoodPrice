/**
 * Comparar pages registry.
 *
 * Gating mechanism: only pages exported here get pre-rendered.
 * To add a new comparison:
 *   1. Create data/programmatic/comparar/[slug].ts
 *   2. Import and push to COMPARAR_PAGES below
 *   3. Run build to verify static generation
 */

import type { CompararPage } from '@/types'

export const COMPARAR_PAGES: CompararPage[] = []

export function getCompararPage(slug: string): CompararPage | undefined {
  return COMPARAR_PAGES.find(p => p.slug === slug)
}

export function getAllCompararSlugs(): string[] {
  return COMPARAR_PAGES.map(p => p.slug)
}
