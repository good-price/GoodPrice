/**
 * lib/catalog/placeholders.ts
 *
 * SVG placeholder images for product cards when the real image
 * is unavailable (broken CDN URL, 404, missing URL, etc.).
 *
 * Strategy:
 *   - One placeholder per product category, with category colour + icon
 *   - Delivered as inline data URIs → ZERO HTTP requests, ZERO 404 risk
 *   - Fixed 400×400 viewBox → no layout shift when used with fill + aspect-square
 *   - Works server-side AND client-side (static string, no DOM APIs)
 *
 * Usage:
 *   import { getCategoryPlaceholder, isKnownBrokenImageUrl } from '@/lib/catalog/placeholders'
 *
 *   // Pre-emptive: check before rendering
 *   const src = isKnownBrokenImageUrl(product.image)
 *     ? getCategoryPlaceholder(product.category)
 *     : product.image
 *
 *   // Reactive: onError fallback in ProductCard
 *   <Image src={src} onError={() => setImgSrc(getCategoryPlaceholder(category))} />
 */

// ── Category config ────────────────────────────────────────────────────────────

interface PlaceholderConfig {
  emoji:   string
  label:   string
  bgColor: string  // Tailwind-inspired, but raw hex for SVG
  fgColor: string  // text colour
}

const CATEGORY_CONFIG: Record<string, PlaceholderConfig> = {
  electronica:  { emoji: '💻', label: 'Electrónica',   bgColor: '#eff6ff', fgColor: '#3b82f6' },
  gaming:       { emoji: '🎮', label: 'Gaming',         bgColor: '#f5f3ff', fgColor: '#7c3aed' },
  hogar:        { emoji: '🏠', label: 'Hogar',          bgColor: '#f0fdf4', fgColor: '#16a34a' },
  cocina:       { emoji: '🍳', label: 'Cocina',         bgColor: '#fefce8', fgColor: '#ca8a04' },
  deporte:      { emoji: '⚽', label: 'Deporte',        bgColor: '#ecfdf5', fgColor: '#059669' },
  oficina:      { emoji: '🖊️', label: 'Oficina',       bgColor: '#f0f9ff', fgColor: '#0284c7' },
  belleza:      { emoji: '💄', label: 'Belleza',        bgColor: '#fdf4ff', fgColor: '#a21caf' },
  mascotas:     { emoji: '🐾', label: 'Mascotas',       bgColor: '#fff7ed', fgColor: '#ea580c' },
  bebes:        { emoji: '🍼', label: 'Bebés',          bgColor: '#fafafa', fgColor: '#78716c' },
  herramientas: { emoji: '🔧', label: 'Herramientas',   bgColor: '#f5f5f4', fgColor: '#57534e' },
}

const DEFAULT_CONFIG: PlaceholderConfig = {
  emoji: '📦', label: 'Producto', bgColor: '#f3f4f6', fgColor: '#6b7280',
}

// ── SVG builder ────────────────────────────────────────────────────────────────

function buildPlaceholderSVG(cfg: PlaceholderConfig): string {
  // Pure SVG — no external resources, no fonts, consistent cross-browser rendering
  return (
    `<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">` +
    // Background
    `<rect width="400" height="400" fill="${cfg.bgColor}"/>` +
    // Soft inner card
    `<rect x="60" y="60" width="280" height="280" rx="24" fill="white" opacity="0.7"/>` +
    // Emoji icon — centred vertically in the card
    `<text x="200" y="210" font-size="84" text-anchor="middle" dominant-baseline="middle"` +
    ` font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${cfg.emoji}</text>` +
    // Category label
    `<text x="200" y="285" font-size="15" text-anchor="middle" dominant-baseline="middle"` +
    ` font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif"` +
    ` font-weight="600" fill="${cfg.fgColor}">${cfg.label}</text>` +
    // Subtitle
    `<text x="200" y="310" font-size="11" text-anchor="middle" dominant-baseline="middle"` +
    ` font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif"` +
    ` fill="#9ca3af">Imagen temporalmente no disponible</text>` +
    `</svg>`
  )
}

// ── Cached data URIs (one per category, built once at module load) ─────────────

const _cache = new Map<string, string>()

function buildDataUri(cfg: PlaceholderConfig): string {
  const svg = buildPlaceholderSVG(cfg)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns a data URI for a category-specific placeholder image.
 * Safe to use as the `src` prop of `<Image>` or `<img>`.
 * Result is memoised — built once per category per process.
 */
export function getCategoryPlaceholder(category: string): string {
  const key = category.toLowerCase()
  if (_cache.has(key)) return _cache.get(key)!
  const cfg = CATEGORY_CONFIG[key] ?? DEFAULT_CONFIG
  const uri = buildDataUri(cfg)
  _cache.set(key, uri)
  return uri
}

/**
 * True when a URL points to an Amazon CDN path that is KNOWN to return 404.
 *
 * Background: Amazon migrated product images from
 *   images-na.ssl-images-amazon.com/images/I/   (deprecated, CDN serves 404)
 * to
 *   m.media-amazon.com/images/I/                 (current, working)
 *
 * Products catalogued before the migration have broken image URLs.
 * These need the placeholder treatment until PA-API sync updates them.
 *
 * Use this for server-side pre-emptive fallback — avoids a round-trip 404
 * before the client-side onError fires.
 */
export function isKnownBrokenImageUrl(url: string | undefined): boolean {
  if (!url) return true
  // Old I/ CDN — consistently returns 404
  if (url.includes('images-na.ssl-images-amazon.com/images/I/')) return true
  // Old P/ASIN format — stale proxy, 404 for most products
  if (url.includes('images-na.ssl-images-amazon.com/images/P/')) return true
  return false
}

/**
 * True when the image URL is structurally invalid (empty, null, not a URL).
 * Different from isKnownBrokenImageUrl — this catches format errors, not CDN issues.
 */
export function isInvalidImageUrl(url: string | undefined): boolean {
  if (!url || typeof url !== 'string') return true
  if (url.trim() === '') return true
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:')) return true
  return false
}

/**
 * Returns the best image src to use for a product:
 *   - Placeholder if the URL is structurally invalid
 *   - Placeholder if the URL is from the known-broken CDN
 *   - Original URL otherwise (may still fail at runtime → handle with onError)
 */
export function getProductImageSrc(image: string | undefined, category: string): string {
  if (isInvalidImageUrl(image) || isKnownBrokenImageUrl(image)) {
    return getCategoryPlaceholder(category)
  }
  return image!
}
