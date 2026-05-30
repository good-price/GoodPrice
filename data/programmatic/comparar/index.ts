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

import airpodsVsGalaxy from './airpods-pro-2-vs-galaxy-buds2-pro'
import ps5VsXbox from './ps5-dualsense-vs-xbox-controller'
import logitechG502VsMxMaster from './logitech-g502-vs-mx-master-3s'

export const COMPARAR_PAGES: CompararPage[] = [
  airpodsVsGalaxy,
  ps5VsXbox,
  logitechG502VsMxMaster,
]

export function getCompararPage(slug: string): CompararPage | undefined {
  return COMPARAR_PAGES.find(p => p.slug === slug)
}

export function getAllCompararSlugs(): string[] {
  return COMPARAR_PAGES.map(p => p.slug)
}
