import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'

import { getReview, getAllReviewSlugs, getAllReviews, extractToc } from '@/lib/content'
import { mdxComponents } from '@/lib/content/mdx-components'
import { getPublicProducts } from '@/lib/catalog/public'

import { Breadcrumbs } from '@/components/editorial/Breadcrumbs'
import { ArticleHero } from '@/components/editorial/ArticleHero'
import { BuyBox } from '@/components/editorial/BuyBox'
import { ReviewScoreboard } from '@/components/editorial/ReviewScoreboard'
import { TableOfContents } from '@/components/editorial/TableOfContents'
import { RelatedArticles } from '@/components/editorial/RelatedArticles'
import { RelatedProducts } from '@/components/editorial/RelatedProducts'

import {
  reviewSchema,
  reviewArticleSchema,
  editorialFaqSchema,
} from '@/lib/seo/editorial'
import { breadcrumbSchema, SITE_URL } from '@/lib/seo'

interface PageProps {
  params: { slug: string }
}

// ── Static generation ─────────────────────────────────────────────────────────

export const revalidate = 86400
export const dynamicParams = false

export function generateStaticParams() {
  return getAllReviewSlugs().map(slug => ({ slug }))
}

export function generateMetadata({ params }: PageProps): Metadata {
  const review = getReview(params.slug)
  if (!review) return {}

  const { frontmatter: fm, slug } = review
  const url = `${SITE_URL}/reviews/${slug}`

  return {
    title: fm.seoTitle,
    description: fm.seoDescription,
    keywords: fm.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: fm.seoTitle,
      description: fm.seoDescription,
      url,
      siteName: 'GOODPRICE',
      locale: 'es_CO',
      type: 'article',
      publishedTime: fm.publishDate,
      modifiedTime: fm.updatedDate,
      ...(fm.featuredImage ? { images: [{ url: fm.featuredImage }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: fm.seoTitle,
      description: fm.seoDescription,
    },
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReviewPage({ params }: PageProps) {
  const review = getReview(params.slug)
  if (!review) notFound()

  const { frontmatter: fm, content, slug, readingTime } = review

  const allProducts = getPublicProducts()

  const product = allProducts.find(p => p.id === fm.productId)
  if (!product) notFound()

  const relatedProducts = (fm.relatedProducts ?? [])
    .map(id => allProducts.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)

  const toc = extractToc(content)

  const relatedArticles = getAllReviews()
    .filter(r => r.slug !== slug && r.frontmatter.cluster === fm.cluster)
    .slice(0, 4)
    .map(r => ({ title: r.frontmatter.title, href: `/reviews/${r.slug}`, type: 'review' as const }))

  const pageUrl = `${SITE_URL}/reviews/${slug}`

  // JSON-LD
  const reviewLd  = reviewSchema(fm, product, slug)
  const articleLd = reviewArticleSchema(fm, slug)
  const faqLd     = editorialFaqSchema([])
  const crumbLd   = breadcrumbSchema([
    { name: 'Inicio',   url: SITE_URL },
    { name: 'Reviews',  url: `${SITE_URL}/reviews` },
    { name: fm.title,   url: pageUrl },
  ])

  return (
    <>
      {/* ── JSON-LD ────────────────────────────────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd) }}
      />

      {/* ── Layout ────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto">
        <div className="lg:grid lg:grid-cols-[1fr_240px] lg:gap-8 lg:items-start">

          {/* ── Article column ──────────────────────────────────────── */}
          <article className="min-w-0">
            <Breadcrumbs
              items={[
                { label: 'Inicio',  href: '/' },
                { label: 'Reviews', href: '/reviews' },
                { label: fm.title },
              ]}
            />

            <ArticleHero
              title={fm.title}
              excerpt={fm.excerpt}
              publishDate={fm.publishDate}
              updatedDate={fm.updatedDate}
              readingTime={readingTime}
              type="review"
              badge={fm.badge}
            />

            {/* Scoreboard: rating + pros/cons + verdict */}
            <div className="mb-6">
              <ReviewScoreboard
                rating={fm.rating}
                pros={fm.pros}
                cons={fm.cons}
                verdict={fm.verdict}
              />
            </div>

            {/* Buy box */}
            <div className="mb-6">
              <BuyBox product={product} />
            </div>

            {/* MDX body */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-6">
              <MDXRemote source={content} components={mdxComponents} />
            </div>

            {/* Related articles */}
            <div className="mb-6">
              <RelatedArticles articles={relatedArticles} />
            </div>

            {/* Related products */}
            {relatedProducts.length > 0 && (
              <div className="mb-6">
                <RelatedProducts
                  products={relatedProducts}
                  title="Productos que también te pueden interesar"
                />
              </div>
            )}

            {/* Affiliate disclosure */}
            <footer className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 leading-relaxed">
                <strong className="text-gray-500">Divulgación de afiliado:</strong>{' '}
                GOODPRICE participa en el programa Amazon Associates. Si compras a través
                de los enlaces de esta página, recibimos una pequeña comisión sin costo
                adicional para ti. Los precios mostrados son los vigentes en Amazon al
                momento de la última validación y pueden variar.
              </p>
            </footer>
          </article>

          {/* ── TOC sidebar ─────────────────────────────────────────── */}
          {toc.length > 0 && (
            <aside className="hidden lg:block">
              <TableOfContents entries={toc} />
            </aside>
          )}
        </div>
      </div>
    </>
  )
}
