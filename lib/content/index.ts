/**
 * MDX content reader for GOODPRICE editorial system.
 *
 * Reads .mdx files from content/{type}/{slug}.mdx using gray-matter.
 * Called exclusively from Server Components (App Router RSC).
 *
 * File tracing for Vercel: next.config.mjs includes content/** in
 * outputFileTracingIncludes so files are available at ISR re-render time.
 */

import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

import type {
  ReviewFrontmatter,
  ReviewContent,
  ComparisonFrontmatter,
  ComparisonContent,
  GuideFrontmatter,
  GuideContent,
  TocEntry,
} from '@/types/editorial'

const CONTENT_ROOT = path.join(process.cwd(), 'content')

// ── Helpers ───────────────────────────────────────────────────────────────────

function readMdxFile(
  type: string,
  slug: string,
): { data: Record<string, unknown>; content: string } | null {
  const filePath = path.join(CONTENT_ROOT, type, `${slug}.mdx`)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const { data, content } = matter(raw)
    return { data, content }
  } catch (err) {
    console.error(`[content] Failed to parse ${filePath}:`, err)
    return null
  }
}

function listSlugs(type: string): string[] {
  const dir = path.join(CONTENT_ROOT, type)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.mdx') && !f.startsWith('_'))
    .map(f => f.replace(/\.mdx$/, ''))
}

function estimateReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 200))
}

// ── Heading slug — must match mdxComponents in lib/content/mdx-components.tsx ─

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export function getReview(slug: string): ReviewContent | null {
  const parsed = readMdxFile('reviews', slug)
  if (!parsed) return null
  return {
    frontmatter: parsed.data as unknown as ReviewFrontmatter,
    content: parsed.content,
    slug,
    readingTime: estimateReadingTime(parsed.content),
  }
}

export function getAllReviewSlugs(): string[] {
  return listSlugs('reviews')
}

export function getAllReviews(): ReviewContent[] {
  return getAllReviewSlugs()
    .map(slug => getReview(slug))
    .filter((r): r is ReviewContent => r !== null)
    .sort(
      (a, b) =>
        new Date(b.frontmatter.publishDate).getTime() -
        new Date(a.frontmatter.publishDate).getTime(),
    )
}

// ── Editorial comparisons (MDX layer) ────────────────────────────────────────

export function getEditorialComparison(slug: string): ComparisonContent | null {
  const parsed = readMdxFile('comparisons', slug)
  if (!parsed) return null
  return {
    frontmatter: parsed.data as unknown as ComparisonFrontmatter,
    content: parsed.content,
    slug,
    readingTime: estimateReadingTime(parsed.content),
  }
}

export function getAllEditorialComparisonSlugs(): string[] {
  return listSlugs('comparisons')
}

// ── Editorial guides (MDX layer) ──────────────────────────────────────────────

export function getEditorialGuide(slug: string): GuideContent | null {
  const parsed = readMdxFile('guides', slug)
  if (!parsed) return null
  return {
    frontmatter: parsed.data as unknown as GuideFrontmatter,
    content: parsed.content,
    slug,
    readingTime: estimateReadingTime(parsed.content),
  }
}

export function getAllEditorialGuideSlugs(): string[] {
  return listSlugs('guides')
}

// ── TOC extractor ─────────────────────────────────────────────────────────────

/**
 * Extracts H2 and H3 headings from raw MDX content.
 * ID generation matches slugifyHeading() — which is also used by mdxComponents
 * to set the actual heading IDs in the rendered HTML.
 */
export function extractToc(mdxContent: string): TocEntry[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm
  const entries: TocEntry[] = []
  let match: RegExpExecArray | null

  while ((match = headingRegex.exec(mdxContent)) !== null) {
    const level = match[1].length as 2 | 3
    const text = match[2].trim()
    entries.push({ id: slugifyHeading(text), text, level })
  }

  return entries
}
