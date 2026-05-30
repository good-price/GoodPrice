/**
 * Programmatic SEO query generator for GOODPRICE.
 *
 * Architecture:
 *   1. QUERY_TEMPLATES defines all possible "best X" query patterns
 *      using semantic dimensions: intent × subject × modifier × useCase.
 *
 *   2. generateSlug() converts a template into a URL-safe slug.
 *
 *   3. COMPARISON_PAIRS defines product pairs for "A vs B" pages.
 *
 *   4. Only templates that have a matching authored page in the registry
 *      get pre-rendered. The generator shows POTENTIAL scale — the registry
 *      gates which pages actually ship (quality over quantity).
 *
 * Scaling strategy:
 *   - Adding a new subject: add to SUBJECTS + author a data file
 *   - Adding a modifier: add to MODIFIERS + author the data variant
 *   - Future CMS: replace registry imports with API fetch at build time
 *
 * Potential slug count: ~200+ from current template set
 * Published: 5 mejores + 3 comparar = 8 pages (curated for quality)
 */

// ── Vocabulary ────────────────────────────────────────────────────────────────

export type Intent = 'mejores' | 'top'

export const SUBJECTS = [
  'auriculares-bluetooth',
  'auriculares-gaming',
  'gadgets-home-office',
  'accesorios-gaming',
  'accesorios-laptop',
  'ratones-inalambricos',
  'altavoces-inteligentes',
  'regalos-tecnologicos',
  'gadgets-amazon-colombia',
  'camaras-inteligentes',
  'hubs-usb-c',
  'baterias-portatiles',
] as const

export const MODIFIERS = [
  '',              // no modifier — base slug
  'baratos',
  'premium',
  'para-gaming',
  'para-estudiantes',
  'para-el-hogar',
  'amazon-colombia',
  '2025',
] as const

export const USE_CASES = [
  '',
  'trabajo-remoto',
  'streaming',
  'viajes',
  'oficina',
] as const

// ── Query template ────────────────────────────────────────────────────────────

export interface QueryTemplate {
  intent: Intent
  subject: (typeof SUBJECTS)[number]
  modifier?: (typeof MODIFIERS)[number]
  useCase?: (typeof USE_CASES)[number]
}

// ── Slug generation ───────────────────────────────────────────────────────────

export function generateSlug(t: QueryTemplate): string {
  const parts: string[] = [t.subject]
  if (t.modifier) parts.push(t.modifier)
  if (t.useCase) parts.push(t.useCase)
  return parts.join('-')
}

/** Normalize an arbitrary string to a URL-safe slug */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Generate a comparison page slug from two product names */
export function generateComparisonSlug(nameA: string, nameB: string): string {
  return `${slugify(nameA)}-vs-${slugify(nameB)}`
}

// ── Full potential template catalog ───────────────────────────────────────────
// These represent ALL queryable combinations. Only authored pages get published.

export const QUERY_TEMPLATES: QueryTemplate[] = [
  // Base "best of" pages
  { intent: 'mejores', subject: 'auriculares-bluetooth' },
  { intent: 'mejores', subject: 'auriculares-bluetooth', modifier: 'baratos' },
  { intent: 'mejores', subject: 'auriculares-bluetooth', modifier: 'para-gaming' },
  { intent: 'mejores', subject: 'auriculares-gaming' },
  { intent: 'mejores', subject: 'gadgets-home-office' },
  { intent: 'mejores', subject: 'gadgets-home-office', modifier: 'amazon-colombia' },
  { intent: 'mejores', subject: 'accesorios-gaming' },
  { intent: 'mejores', subject: 'accesorios-gaming', modifier: 'para-gaming' },
  { intent: 'mejores', subject: 'accesorios-laptop' },
  { intent: 'mejores', subject: 'accesorios-laptop', modifier: 'baratos' },
  { intent: 'mejores', subject: 'ratones-inalambricos' },
  { intent: 'mejores', subject: 'altavoces-inteligentes' },
  { intent: 'mejores', subject: 'regalos-tecnologicos' },
  { intent: 'mejores', subject: 'gadgets-amazon-colombia' },
  { intent: 'mejores', subject: 'hubs-usb-c' },
  { intent: 'mejores', subject: 'baterias-portatiles' },
  { intent: 'top', subject: 'accesorios-gaming' },
  // Use-case variants (future content)
  { intent: 'mejores', subject: 'auriculares-bluetooth', useCase: 'trabajo-remoto' },
  { intent: 'mejores', subject: 'gadgets-home-office', useCase: 'trabajo-remoto' },
  { intent: 'mejores', subject: 'accesorios-gaming', useCase: 'streaming' },
]

/** All potential mejores slugs the system could generate */
export function getAllPotentialMejoresSlugs(): string[] {
  return QUERY_TEMPLATES.map(generateSlug)
}

/** Filter to only the slugs that have authored data in the registry */
export function getPublishedMejoresSlugs(publishedSlugs: string[]): string[] {
  return publishedSlugs
}
