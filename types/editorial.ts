/**
 * MDX-based editorial content types for GOODPRICE.
 *
 * Three content types live under content/:
 *   reviews/      → /reviews/[slug]
 *   comparisons/  → /comparar/[slug]  (editorial layer over programmatic)
 *   guides/       → /guias/[slug]     (editorial layer over programmatic)
 *
 * Frontmatter is parsed by gray-matter in lib/content/index.ts.
 */

import type { FAQItem } from './index'

export type EditorialCluster =
  | 'apple'
  | 'streaming'
  | 'audio'
  | 'gaming'
  | 'smart-home'
  | 'lectura'

// ── Review ────────────────────────────────────────────────────────────────────

export interface ReviewFrontmatter {
  title: string
  slug: string
  excerpt: string
  publishDate: string        // ISO date: "2026-06-10"
  updatedDate: string
  author: string
  featuredImage?: string     // /images/reviews/slug.jpg
  seoTitle: string
  seoDescription: string     // ≤160 chars
  keywords: string[]
  productId: string          // catalog RawProduct.id (e.g. "game-002")
  rating: number             // 1–10
  pros: string[]
  cons: string[]
  verdict: string            // 1–2 sentence bottom line
  relatedProducts?: string[] // other catalog product ids
  cluster: EditorialCluster
  badge?: string             // "Nuevo", "2026", etc.
}

export interface ReviewContent {
  frontmatter: ReviewFrontmatter
  content: string            // raw MDX body (passed to MDXRemote)
  slug: string
  readingTime: number        // minutes, derived at read time
}

// ── Comparison ────────────────────────────────────────────────────────────────

export interface ComparisonSection {
  label: string
  leftValue: string
  rightValue: string
  winner?: 'left' | 'right' | 'tie'
}

export interface ComparisonFrontmatter {
  title: string
  slug: string
  excerpt: string
  publishDate: string
  updatedDate: string
  author: string
  featuredImage?: string
  seoTitle: string
  seoDescription: string
  keywords: string[]
  leftProductId: string      // catalog RawProduct.id
  rightProductId: string
  winner: 'left' | 'right' | 'tie'
  winnerReason: string
  comparisonSections: ComparisonSection[]
  relatedProducts?: string[]
  cluster: EditorialCluster
  badge?: string
}

export interface ComparisonContent {
  frontmatter: ComparisonFrontmatter
  content: string
  slug: string
  readingTime: number
}

// ── Guide ─────────────────────────────────────────────────────────────────────

export interface GuideFrontmatter {
  title: string
  slug: string
  excerpt: string
  publishDate: string
  updatedDate: string
  author: string
  featuredImage?: string
  seoTitle: string
  seoDescription: string
  keywords: string[]
  recommendedProducts: string[]  // catalog ids, ordered by recommendation rank
  faq: FAQItem[]
  cluster: EditorialCluster
  badge?: string
}

export interface GuideContent {
  frontmatter: GuideFrontmatter
  content: string
  slug: string
  readingTime: number
}

// ── Shared ────────────────────────────────────────────────────────────────────

export interface TocEntry {
  id: string
  text: string
  level: 2 | 3
}

export interface ArticleRef {
  title: string
  href: string
  type: 'review' | 'comparison' | 'guide'
}
