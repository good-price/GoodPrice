/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── C2: File tracing for data/tpe/ JSON stores ────────────────────────────
  // Next.js cannot auto-trace files accessed via path.resolve(process.cwd(), ...)
  // because the path is constructed at runtime, not statically importable.
  // Without this, data/tpe/*.json may be absent in the serverless function
  // bundle, causing ENOENT at runtime on Vercel.
  //
  // In Next.js 14, outputFileTracingIncludes lives under `experimental`.
  // Scope: only the evaluate-local route reads from the pool at runtime.
  // Other data/tpe/ reads happen exclusively in scripts/ (local, not Vercel).
  experimental: {
    outputFileTracingIncludes: {
      '/api/tpe/evaluate-local': ['./data/tpe/**'],
      // Health check reads runtime-catalog.json and audit/ at runtime
      '/api/health': ['./data/catalog/runtime-catalog.json', './data/audit/**', './data/ops/**'],
      // MDX editorial content — needed for ISR re-renders on Vercel
      '/reviews/[slug]':     ['./content/reviews/**'],
      '/comparar/[slug]':    ['./content/comparisons/**'],
      '/guias/[slug]':       ['./content/guides/**'],
      // Currency seed — provides baseline TRM on Vercel cold starts before
      // the first cron write. Needed by all ISR product/category pages.
      '/**':                 ['./data/currency/**'],
    },
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images-na.ssl-images-amazon.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
        pathname: '/**',
      },
      // MercadoLibre product images (CDN)
      {
        protocol: 'https',
        hostname: 'http2.mlstatic.com',
        pathname: '/**',
      },
    ],
  },

  async headers() {
    return [
      {
        // Apply to every route
        source: '/(.*)',
        headers: [
          // ── Clickjacking protection ──────────────────────────────
          { key: 'X-Frame-Options', value: 'DENY' },

          // ── MIME-type sniffing protection ────────────────────────
          { key: 'X-Content-Type-Options', value: 'nosniff' },

          // ── Referrer — send origin only to cross-origin HTTPS ───
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

          // ── Disable browser APIs not used by the app ─────────────
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },

          // ── DNS prefetch for performance ─────────────────────────
          { key: 'X-DNS-Prefetch-Control', value: 'on' },

          // ── HSTS — 1 year, include subdomains ────────────────────
          // Safe to set unconditionally: ignored by browsers on HTTP,
          // enforced only over HTTPS.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },

          // ── Content Security Policy ──────────────────────────────
          // 'unsafe-inline' for scripts is required by:
          //   - Next.js inline JSON-LD <script> blocks (structured data)
          //   - Next.js App Router hydration scripts
          // 'unsafe-inline' for styles is required by Tailwind CSS.
          // GA4 requires:
          //   - script-src: googletagmanager.com (loader script)
          //   - connect-src: google-analytics.com + analytics.google.com (event beacons)
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Amazon CDN + MercadoLibre CDN product images
              "img-src 'self' data: blob: https://m.media-amazon.com https://images-na.ssl-images-amazon.com https://http2.mlstatic.com",
              "font-src 'self' https://fonts.gstatic.com",
              // Same-origin API calls + GA4 event beacons
              "connect-src 'self' https://www.google-analytics.com https://analytics.google.com",
              "media-src 'none'",
              "object-src 'none'",
              // Stronger clickjacking protection (duplicates X-Frame-Options for CSP-aware browsers)
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
