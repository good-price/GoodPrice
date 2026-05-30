/** @type {import('next').NextConfig} */
const nextConfig = {
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
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Amazon CDN + MercadoLibre CDN product images
              "img-src 'self' data: blob: https://m.media-amazon.com https://images-na.ssl-images-amazon.com https://http2.mlstatic.com",
              "font-src 'self' https://fonts.gstatic.com",
              // All API calls go to same origin
              "connect-src 'self'",
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
