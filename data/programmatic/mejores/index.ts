/**
 * Mejores pages registry.
 *
 * Gating mechanism: only pages exported here get pre-rendered.
 * The slug generator (lib/programmatic/generator.ts) defines 200+ potential slugs —
 * this registry is the quality gate that controls which ones actually ship.
 *
 * To add a new mejores page:
 *   1. Create data/programmatic/mejores/[slug].ts
 *   2. Import and push to MEJORES_PAGES below
 *   3. Run build to verify static generation
 */

import type { MejoresPage } from '@/types'

export const MEJORES_PAGES: MejoresPage[] = []

export function getMejoresPage(slug: string): MejoresPage | undefined {
  return MEJORES_PAGES.find(p => p.slug === slug)
}

export function getAllMejoresSlugs(): string[] {
  return MEJORES_PAGES.map(p => p.slug)
}
