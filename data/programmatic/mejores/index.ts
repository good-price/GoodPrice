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

import auricularesBluetooth from './auriculares-bluetooth'
import gadgetsHomeOffice from './gadgets-home-office'
import accesoriosGaming from './accesorios-gaming'
import regalosTecnologicos from './regalos-tecnologicos'
import gadgetsAmazonColombia from './gadgets-amazon-colombia'

export const MEJORES_PAGES: MejoresPage[] = [
  auricularesBluetooth,
  gadgetsHomeOffice,
  accesoriosGaming,
  regalosTecnologicos,
  gadgetsAmazonColombia,
]

export function getMejoresPage(slug: string): MejoresPage | undefined {
  return MEJORES_PAGES.find(p => p.slug === slug)
}

export function getAllMejoresSlugs(): string[] {
  return MEJORES_PAGES.map(p => p.slug)
}
