import type { Metadata } from 'next'
import Script from 'next/script'
import { Inter } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import { baseMetadata } from '@/lib/seo'

const inter = Inter({ subsets: ['latin'] })
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? ''

/**
 * Root layout metadata.
 *
 * Verification tags (added when env vars are set in Vercel dashboard):
 *   GOOGLE_SITE_VERIFICATION → <meta name="google-site-verification" content="..." />
 *   BING_SITE_VERIFICATION   → <meta name="msvalidate.01" content="..." />
 *
 * How to get each token:
 *   Google: https://search.google.com/search-console → Add Property → "HTML tag" method
 *           Copy the `content` value only (not the full <meta> tag)
 *   Bing:   https://www.bing.com/webmasters → Add Site → "Meta tag" method
 *           Copy the `content` value only
 *
 * These are evaluated at BUILD TIME — set them in Vercel env vars before deploying.
 */
export const metadata: Metadata = {
  ...baseMetadata,
  verification: {
    // Google Search Console
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : {}),
    // Bing Webmaster Tools — uses the "other" bucket for custom meta names
    ...(process.env.BING_SITE_VERIFICATION
      ? { other: { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } }
      : {}),
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-gray-100 min-h-screen`}>
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}', {
                  page_path: window.location.pathname,
                  cookie_flags: 'SameSite=None;Secure',
                });
              `}
            </Script>
          </>
        )}
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
