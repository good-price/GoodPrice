import type { ExtractedAttributes, ProductCategory } from './types'
import { detectProductType } from './product-type'

// ── Model number pattern ───────────────────────────────────────────────────────
// Branch 1: letter-led codes  — WH-1000XM5, MD2380, T7, G1, EDR1RXD1
// Branch 2: digit-led codes   — 1TB, 910XL, 67XL  (requires ≥2 uppercase letters
//           to exclude single-unit suffixes like 60H, 12H, 52W, 84L)
const MODEL_PATTERN =
  /\b([A-Z]{1,4}-?[A-Z0-9]{0,6}[0-9][A-Z0-9]{0,6}|[0-9]{1,3}[A-Z]{2,5})\b/

// ── Capacity / size variants ───────────────────────────────────────────────────
// Matches specs that act as meaningful product differentiators (20 oz, 1TB, 37 lbs)
const VARIANT_PATTERN =
  /\b(\d+(?:\.\d+)?\s*(?:TB|GB|MB|oz|fl\s*oz|ml|L\b|lbs?|kg|inch|inches|cm|mAh))\b/i

// ── Product line vocabulary ────────────────────────────────────────────────────

const COLOR_WORDS = new Set([
  'black', 'white', 'silver', 'grey', 'gray', 'blue', 'red', 'pink',
  'green', 'neon', 'purple', 'orange', 'yellow', 'gold', 'rose',
  'midnight', 'teal', 'navy', 'beige', 'brown', 'cream', 'coral',
  'lilac', 'charcoal', 'cobalt', 'denim', 'slate', 'maroon', 'ivory',
  'copper', 'bronze', 'platinum', 'jade', 'turquoise', 'lavender',
  'quartz', 'sand', 'peach', 'blush', 'arctic', 'graphite',
])

const LINE_STOP_WORDS = new Set([
  'for', 'with', 'and', 'or', 'from', 'by', 'to', 'of', 'in', 'the',
  'a', 'an', 'at', 'on', 'as', 'is', 'vs', 'no', 'anti',
])

// Words that look like model codes but are actually known junk
const SKIP_LINE_WORDS = new Set([
  'bpa', 'usb', 'usbc', 'uhd', 'hdr', 'led', 'lcd', 'hepa', 'merv',
  'vox', 'ipx', 'tws', 'awj', 'ce', 'ansi', 'etl', 'ul', 'fda',
  'epa', 'eco', 'usa', 'us', 'ota', 'nfc',
])

function isColorWord(word: string): boolean {
  return word.split('/').every(p => COLOR_WORDS.has(p.toLowerCase().replace(/[^a-z]/g, '')))
}

// ── Core noun per category ─────────────────────────────────────────────────────

const CATEGORY_CORE_NOUN: Record<ProductCategory, string> = {
  electronica:  'dispositivo',
  gaming:       'accesorio gamer',
  hogar:        'artículo para el hogar',
  cocina:       'accesorio de cocina',
  oficina:      'artículo de oficina',
  deporte:      'artículo deportivo',
  belleza:      'producto de belleza',
  bebes:        'artículo para bebé',
  mascotas:     'artículo para mascota',
  herramientas: 'herramienta',
}

// ── Brand extraction ───────────────────────────────────────────────────────────

function extractBrandFromTitle(title: string): string {
  const words = title.split(/\s+/)
  const brandWords: string[] = []
  for (const word of words) {
    const clean = word.replace(/[^A-Za-z&]/g, '')
    if (!clean) break
    const isProper = /^[A-Z]/.test(clean) || /^[A-Z]{2,}$/.test(clean)
    if (!isProper && !['&', 'de', 'by'].includes(clean.toLowerCase())) break
    brandWords.push(word)
    if (brandWords.length >= 3) break
  }
  return brandWords.join(' ') || words[0] || 'Producto'
}

// ── Product line extraction (BUG 4) ───────────────────────────────────────────
// Extracts a named product family (Rambler, Joy-Con, Toleriane, Tower Fan…)
// when no alphanumeric model number is present.

function extractProductLine(cleanedTitle: string, brand: string): string {
  let rest = cleanedTitle.trim()

  if (brand) {
    const brandLower = brand.toLowerCase()
    if (rest.toLowerCase().startsWith(brandLower)) {
      rest = rest.slice(brand.length).trim().replace(/^[,\s\-–]+/, '').trim()
    }
  }

  // Stop at structural separators: comma, pipe, parenthetical, or " – CapWord"
  const stopIdx = rest.search(/[,(|]/)
  const segment = stopIdx > 0 ? rest.slice(0, stopIdx).trim() : rest

  const words  = segment.split(/\s+/)
  const result: string[] = []

  for (const word of words) {
    if (!word) continue
    const clean = word.replace(/[^A-Za-z0-9\-+]/g, '') // keep hyphens and plus
    if (!clean) continue                              // "&", ".", "°" → skip
    if (/^\d+$/.test(clean)) break                   // pure number → stop
    if (LINE_STOP_WORDS.has(clean.toLowerCase())) break
    if (SKIP_LINE_WORDS.has(clean.toLowerCase())) continue
    if (isColorWord(word)) continue                  // color → skip, keep going
    result.push(word)
    if (result.length >= 2) break
  }

  return result.join(' ')
}

// ── Model extraction ───────────────────────────────────────────────────────────

function extractModel(cleanedTitle: string, brand: string): string {
  const withoutBrand = cleanedTitle.toLowerCase().startsWith(brand.toLowerCase())
    ? cleanedTitle.slice(brand.length).trim()
    : cleanedTitle
  const match = withoutBrand.match(MODEL_PATTERN)
  return match ? match[0] : ''
}

function extractVariant(title: string): string {
  const match = title.match(VARIANT_PATTERN)
  return match ? match[0].trim() : ''
}

// ── Public function ────────────────────────────────────────────────────────────

export function extractAttributes(
  cleanedTitle: string,
  knownBrand:   string | undefined,
  category:     ProductCategory,
): ExtractedAttributes {
  const brand       = knownBrand?.trim() || extractBrandFromTitle(cleanedTitle)
  const model       = extractModel(cleanedTitle, brand)
  const productLine = model ? '' : extractProductLine(cleanedTitle, brand)
  const variant     = extractVariant(cleanedTitle)
  const coreNoun    = CATEGORY_CORE_NOUN[category]
  const productType = detectProductType(cleanedTitle)

  return { brand, model, productLine, variant, coreNoun, productType }
}
