/**
 * SEO metadata builders for GOODPRICE.
 *
 * Each function returns a Next.js Metadata object ready to be exported
 * from a page's generateMetadata() or as a static export const metadata.
 *
 * Canonical URL strategy:
 *   - Every public page declares its canonical URL
 *   - Dynamic search results (/productos?q=...) are noindex by convention
 *   - Admin routes are excluded from indexing via robots.txt
 *
 * Set NEXT_PUBLIC_SITE_URL in your .env.local (and Vercel env vars) to
 * use your real domain. Defaults to a safe placeholder for local dev.
 */

import type { Metadata } from 'next'
import type { Product, Category } from '@/types'

// ── Site constants ────────────────────────────────────────────────────────────

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://goodprice.vercel.app'
).replace(/\/$/, '')

export const SITE_NAME = 'GOODPRICE'

export const SITE_DESCRIPTION =
  'Los mejores productos de Amazon curados para Colombia. ' +
  'Electrónica, gaming, hogar, deportes y más. Precios verificados, envío real.'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Trim a string to maxLen chars, breaking cleanly at the last word */
export function truncateSEO(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen).replace(/\s+\S*$/, '').trimEnd() + '…'
}

/** Percent discount helper */
function discountPct(price: number, oldPrice: number): number {
  return Math.round(((oldPrice - price) / oldPrice) * 100)
}

// ── Base metadata (layout level) ─────────────────────────────────────────────

/**
 * Base metadata injected in app/layout.tsx.
 * Sets metadataBase (critical for relative URL resolution), global robots,
 * and default OpenGraph/Twitter values inherited by all pages.
 */
export const baseMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,

  title: {
    default: `${SITE_NAME} — Los mejores precios de Amazon para Colombia`,
    template: `%s | ${SITE_NAME}`,
  },

  description: SITE_DESCRIPTION,

  keywords: [
    'amazon colombia', 'compras amazon', 'mejores precios amazon',
    'electronica amazon', 'ofertas amazon colombia', 'afiliado amazon',
    'productos amazon colombia', 'envio colombia amazon',
  ],

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  openGraph: {
    siteName: SITE_NAME,
    locale: 'es_CO',      // Colombia target market
    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',
  },
}

// ── Page-level metadata builders ─────────────────────────────────────────────

/** Home page */
export function buildHomeMetadata(): Metadata {
  const title = `${SITE_NAME} — Los mejores precios de Amazon para Colombia`
  const description = SITE_DESCRIPTION
  const url = SITE_URL

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'es_CO',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

/** /productos catalog page */
export function buildCatalogMetadata(): Metadata {
  const title = 'Catálogo completo de Amazon para Colombia'
  const description =
    'Explora más de 200 productos de Amazon curados para Colombia. ' +
    'Filtra por categoría, precio y valoración. Precios en dólares, envío real.'
  const url = `${SITE_URL}/productos`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE_NAME, locale: 'es_CO', type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

/** /ofertas page */
export function buildOffersMetadata(): Metadata {
  const title = 'Ofertas del día en Amazon — descuentos reales para Colombia'
  const description =
    'Las mejores ofertas y descuentos de Amazon disponibles para envío a Colombia. ' +
    'Actualizadas diariamente. Sin spam, sin precios inflados.'
  const url = `${SITE_URL}/ofertas`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE_NAME, locale: 'es_CO', type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

/** /top-ventas page */
export function buildTopSellersMetadata(): Metadata {
  const title = 'Más vendidos en Amazon — top ventas para Colombia'
  const description =
    'Los productos más vendidos en Amazon curados para envío a Colombia. ' +
    'Ranking actualizado con los artículos de mayor demanda y mejor valoración.'
  const url = `${SITE_URL}/top-ventas`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE_NAME, locale: 'es_CO', type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

/** /categorias index page */
export function buildCategoriesIndexMetadata(): Metadata {
  const title = 'Todas las categorías de Amazon para Colombia'
  const description =
    'Explora todas las categorías de productos de Amazon curados para Colombia: ' +
    'electrónica, gaming, hogar, cocina, deporte, oficina y más.'
  const url = `${SITE_URL}/categorias`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE_NAME, locale: 'es_CO', type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

/** /categorias/[slug] — individual category page */
export function buildCategoryMetadata(cat: Category, productCount: number): Metadata {
  const title = `${cat.name} en Amazon — mejores precios para Colombia`
  const description =
    `${productCount} producto${productCount !== 1 ? 's' : ''} de ${cat.name} curados en Amazon ` +
    `para Colombia. Precios reales, verificados y con envío internacional disponible.`
  const url = `${SITE_URL}/categorias/${cat.slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'es_CO',
      type: 'website',
    },
    twitter: { card: 'summary', title, description },
  }
}

/** /productos/[asin] — individual product page */
export function buildProductMetadata(product: Product): Metadata {
  // Keep title concise — template appends "| GOODPRICE" so budget ~55 chars
  const shortTitle = truncateSEO(product.title, 55)
  const title = `${shortTitle} — $${product.price.toFixed(2)}`

  const brandPart = product.brand ? ` de ${product.brand}` : ''
  const discount = product.oldPrice ? ` (-${discountPct(product.price, product.oldPrice)}%)` : ''
  const description =
    `${truncateSEO(product.title, 90)}${brandPart}. ` +
    `Precio: $${product.price.toFixed(2)}${discount}. ` +
    `Disponible en Amazon con envío a Colombia.`

  const url = `${SITE_URL}/productos/${product.asin}`

  // Product image from Amazon CDN (already whitelisted in next.config.mjs)
  const image = product.image

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'es_CO',
      type: 'website',
      images: [{ url: image, width: 800, height: 800, alt: product.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}
