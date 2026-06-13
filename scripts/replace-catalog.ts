/**
 * scripts/replace-catalog.ts
 *
 * Replaces the GOODPRICE catalog with the 56 gold products from catalog-gold.json.
 * - Updates image, title, price, rating, reviews from live scraped data
 * - Preserves badge, brand, oldPrice, isTopSeller, isOffer, shipsToColombiaConfirmed
 *   from original catalog
 * - Rewrites all 9 category TS files
 * - Updates data/pricing/mappings.json
 * - Updates programmatic/mejores, category-pages, and guides that reference dead IDs
 *
 * Usage: npx tsx scripts/replace-catalog.ts
 */

import * as fs from 'fs'
import * as path from 'path'

// ── Types ──────────────────────────────────────────────────────────────────────

interface GoldProduct {
  rank: number
  id: string
  asin: string
  category: string
  grade: string
  title: string
  image: string
  imageSource: string
  livePrice: string | null
  liveRating: string | null
  liveReviews: string | null
  catalogPrice: number
  catalogRating: number
  catalogReviews: number
}

interface OriginalProduct {
  id: string
  asin: string
  title: string
  category: string
  image: string
  price: number
  oldPrice?: number
  rating: number
  reviews: number
  badge?: string
  isTopSeller?: boolean
  isOffer?: boolean
  brand?: string
  description?: string
  status?: string
  lastValidated?: string
  shipsToColombiaConfirmed?: boolean
}

// ── Load data ──────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..')
const goldPath = path.join(ROOT, 'data/catalog-gold.json')

const goldData = JSON.parse(fs.readFileSync(goldPath, 'utf8'))
const goldProducts: GoldProduct[] = goldData.products

const goldIds = new Set(goldProducts.map(p => p.id))
const goldByAsin = new Map(goldProducts.map(p => [p.asin, p]))
const goldById = new Map(goldProducts.map(p => [p.id, p]))

console.log(`\n━━━ GOODPRICE Catalog Replacement ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`  Gold products: ${goldProducts.length}`)
console.log(`  Categories: ${[...new Set(goldProducts.map(p => p.category))].join(', ')}`)
console.log()

// ── Parse original catalog TS files ───────────────────────────────────────────

function parsePrice(livePrice: string | null, fallback: number): number {
  if (!livePrice) return fallback
  const num = parseFloat(livePrice.replace(/[^0-9.]/g, ''))
  return isNaN(num) ? fallback : num
}

function parseRating(liveRating: string | null, fallback: number): number {
  if (!liveRating) return fallback
  const num = parseFloat(liveRating)
  return isNaN(num) ? fallback : num
}

function parseReviews(liveReviews: string | null, fallback: number): number {
  if (!liveReviews) return fallback
  const num = parseInt(liveReviews.replace(/[^0-9]/g, ''), 10)
  return isNaN(num) ? fallback : num
}

// Extract product objects from TS catalog files using regex
function extractProductsFromTs(filePath: string): OriginalProduct[] {
  const content = fs.readFileSync(filePath, 'utf8')
  const products: OriginalProduct[] = []

  // Find each product block between { and matching }
  let depth = 0
  let start = -1

  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') {
      if (depth === 0 && start === -1) {
        // Check if this looks like a product entry (preceded by whitespace/comma or array open)
        const before = content.slice(Math.max(0, i - 5), i).trim()
        if (before.endsWith(',') || before.endsWith('[') || before === '') {
          start = i
        }
      }
      depth++
    } else if (content[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        const block = content.slice(start, i + 1)
        const p = parseProductBlock(block)
        if (p) products.push(p)
        start = -1
      }
    }
  }

  return products
}

function parseProductBlock(block: string): OriginalProduct | null {
  function extract(key: string): string | undefined {
    // Match: key: 'value' or key: "value"
    const strMatch = block.match(new RegExp(`\\b${key}:\\s*['"]([^'"]+)['"]`))
    if (strMatch) return strMatch[1]
    return undefined
  }

  function extractNum(key: string): number | undefined {
    const match = block.match(new RegExp(`\\b${key}:\\s*([0-9]+(?:\\.[0-9]+)?)`))
    if (match) return parseFloat(match[1])
    return undefined
  }

  function extractBool(key: string): boolean | undefined {
    const match = block.match(new RegExp(`\\b${key}:\\s*(true|false)`))
    if (match) return match[1] === 'true'
    return undefined
  }

  const id = extract('id')
  const asin = extract('asin')
  if (!id || !asin) return null

  return {
    id,
    asin,
    title: extract('title') ?? '',
    category: extract('category') ?? '',
    image: extract('image') ?? '',
    price: extractNum('price') ?? 0,
    oldPrice: extractNum('oldPrice'),
    rating: extractNum('rating') ?? 0,
    reviews: extractNum('reviews') ?? 0,
    badge: extract('badge'),
    isTopSeller: extractBool('isTopSeller'),
    isOffer: extractBool('isOffer'),
    brand: extract('brand'),
    description: extract('description'),
    status: extract('status'),
    lastValidated: extract('lastValidated'),
    shipsToColombiaConfirmed: extractBool('shipsToColombiaConfirmed'),
  }
}

// ── Build merged catalog ───────────────────────────────────────────────────────

const CATALOG_DIR = path.join(ROOT, 'data/catalog')
const CATEGORY_FILES: Record<string, string> = {
  belleza:      'belleza.ts',
  cocina:       'cocina.ts',
  deporte:      'deporte.ts',
  electronica:  'electronica.ts',
  gaming:       'gaming.ts',
  herramientas: 'herramientas.ts',
  hogar:        'hogar.ts',
  mascotas:     'mascotas.ts',
  oficina:      'oficina.ts',
}

// Load all original products
const originalByAsin = new Map<string, OriginalProduct>()
const originalById = new Map<string, OriginalProduct>()

for (const [cat, file] of Object.entries(CATEGORY_FILES)) {
  const filePath = path.join(CATALOG_DIR, file)
  if (!fs.existsSync(filePath)) {
    console.log(`  [warn] Missing: ${file}`)
    continue
  }
  const products = extractProductsFromTs(filePath)
  for (const p of products) {
    originalByAsin.set(p.asin, p)
    originalById.set(p.id, p)
  }
  console.log(`  Parsed ${file}: ${products.length} products`)
}

console.log(`\n  Total original products: ${originalByAsin.size}`)

// ── Generate product TS entry ──────────────────────────────────────────────────

function formatPrice(n: number): string {
  // Remove trailing .00 for whole numbers
  return n % 1 === 0 ? n.toFixed(2) : n.toString()
}

function buildProductEntry(gold: GoldProduct): string {
  const orig = originalByAsin.get(gold.asin) ?? originalById.get(gold.id)

  const price = parsePrice(gold.livePrice, gold.catalogPrice)
  const rating = parseRating(gold.liveRating, gold.catalogRating)
  const reviews = parseReviews(gold.liveReviews, gold.catalogReviews)
  const oldPrice = orig?.oldPrice
  const badge = orig?.badge
  const isTopSeller = orig?.isTopSeller ?? false
  const isOffer = orig?.isOffer ?? false
  const brand = orig?.brand
  const shipsToColombiaConfirmed = orig?.shipsToColombiaConfirmed ?? true

  // Use the exact Amazon title from gold.json if it's clean; else fall back to catalog title
  const title = gold.title.replace(/'/g, "\\'")

  const lines: string[] = [
    `  {`,
    `    id: '${gold.id}',`,
    `    asin: '${gold.asin}',`,
    `    title: '${title}',`,
    `    category: '${gold.category}',`,
    `    image: '${gold.image}',`,
    `    price: ${formatPrice(price)},`,
  ]

  if (oldPrice !== undefined) {
    lines.push(`    oldPrice: ${formatPrice(oldPrice)},`)
  }

  lines.push(`    rating: ${rating},`)
  lines.push(`    reviews: ${reviews},`)

  if (badge) {
    lines.push(`    badge: '${badge.replace(/'/g, "\\'")}',`)
  }

  lines.push(`    isTopSeller: ${isTopSeller},`)
  lines.push(`    isOffer: ${isOffer},`)

  if (brand) {
    lines.push(`    brand: '${brand.replace(/'/g, "\\'")}',`)
  }

  lines.push(`    status: 'active',`)
  lines.push(`    lastValidated: '2026-06-10',`)
  lines.push(`    shipsToColombiaConfirmed: ${shipsToColombiaConfirmed},`)
  lines.push(`  },`)

  return lines.join('\n')
}

// ── Write catalog files ────────────────────────────────────────────────────────

const goldByCategory = new Map<string, GoldProduct[]>()
for (const p of goldProducts) {
  if (!goldByCategory.has(p.category)) goldByCategory.set(p.category, [])
  goldByCategory.get(p.category)!.push(p)
}

// Sort by rank within each category
for (const [, products] of goldByCategory) {
  products.sort((a, b) => a.rank - b.rank)
}

const allCategories = ['belleza', 'cocina', 'deporte', 'electronica', 'gaming', 'herramientas', 'hogar', 'mascotas', 'oficina']
const report: Array<{ category: string; count: number; status: string }> = []

console.log('\n── Writing catalog files ───────────────────────────────────────────')

for (const cat of allCategories) {
  const filePath = path.join(CATALOG_DIR, `${cat}.ts`)
  const products = goldByCategory.get(cat) ?? []

  if (products.length === 0) {
    // Empty category — write minimal file with empty array
    const content = `import { RawProduct } from '@/types'\n\nconst ${cat}: RawProduct[] = []\n\nexport default ${cat}\n`
    fs.writeFileSync(filePath, content, 'utf8')
    report.push({ category: cat, count: 0, status: 'empty (no gold products)' })
    console.log(`  ${cat.padEnd(14)} 0 products  [empty]`)
    continue
  }

  const entries = products.map(buildProductEntry)
  const content = `import { RawProduct } from '@/types'\n\nconst ${cat}: RawProduct[] = [\n${entries.join('\n')}\n]\n\nexport default ${cat}\n`

  // Write BOM-free UTF-8
  const encoder = new TextEncoder()
  fs.writeFileSync(filePath, encoder.encode(content))
  report.push({ category: cat, count: products.length, status: 'updated' })
  console.log(`  ${cat.padEnd(14)} ${products.length} products`)
}

// ── Update data/pricing/mappings.json ─────────────────────────────────────────

console.log('\n── Updating pricing/mappings.json ─────────────────────────────────')

const mappingsPath = path.join(ROOT, 'data/pricing/mappings.json')
if (fs.existsSync(mappingsPath)) {
  const mappingsRaw = fs.readFileSync(mappingsPath, 'utf8')
  let mappings: Record<string, unknown>

  try {
    mappings = JSON.parse(mappingsRaw)
  } catch {
    console.log(`  [warn] Could not parse mappings.json — skipping`)
    mappings = {}
  }

  // Count keys before
  const before = Object.keys(mappings).length
  const newMappings: Record<string, unknown> = {}

  for (const [key, val] of Object.entries(mappings)) {
    // Keep if the key is a gold product ID
    if (goldIds.has(key)) {
      newMappings[key] = val
    }
  }

  const after = Object.keys(newMappings).length
  const removed = before - after

  fs.writeFileSync(mappingsPath, JSON.stringify(newMappings, null, 2) + '\n', 'utf8')
  console.log(`  Before: ${before} entries, After: ${after} entries, Removed: ${removed}`)
} else {
  console.log(`  [skip] mappings.json not found`)
}

// ── Update programmatic files that reference dead product IDs ─────────────────

console.log('\n── Updating programmatic files ─────────────────────────────────────')

function updateFeaturedIds(filePath: string, fileLabel: string): void {
  if (!fs.existsSync(filePath)) {
    console.log(`  [skip] ${fileLabel} not found`)
    return
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const match = content.match(/featuredProductIds:\s*\[([^\]]+)\]/)

  if (!match) {
    console.log(`  [skip] ${fileLabel} — no featuredProductIds`)
    return
  }

  const ids = match[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) ?? []
  const goldOnly = ids.filter(id => goldIds.has(id))
  const removed = ids.filter(id => !goldIds.has(id))

  if (removed.length === 0) {
    console.log(`  [ok]   ${fileLabel} — all ${ids.length} IDs in gold`)
    return
  }

  const newList = goldOnly.map(id => `'${id}'`).join(', ')
  const newContent = content.replace(
    /featuredProductIds:\s*\[([^\]]+)\]/,
    `featuredProductIds: [${newList}]`
  )

  fs.writeFileSync(filePath, newContent, 'utf8')
  console.log(`  [fix]  ${fileLabel} — removed: [${removed.join(', ')}], kept: [${goldOnly.join(', ')}]`)
}

function updateProductIds(filePath: string, fileLabel: string, key: string): void {
  if (!fs.existsSync(filePath)) {
    console.log(`  [skip] ${fileLabel} not found`)
    return
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const pattern = new RegExp(`${key}:\\s*\\[([^\\]]+)\\]`)
  const match = content.match(pattern)

  if (!match) {
    console.log(`  [skip] ${fileLabel} — no ${key}`)
    return
  }

  const ids = match[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) ?? []
  const goldOnly = ids.filter(id => goldIds.has(id))
  const removed = ids.filter(id => !goldIds.has(id))

  if (removed.length === 0) {
    console.log(`  [ok]   ${fileLabel} — all ${ids.length} IDs in gold`)
    return
  }

  const newList = goldOnly.map(id => `'${id}'`).join(', ')
  const newContent = content.replace(
    pattern,
    `${key}: [${newList}]`
  )

  fs.writeFileSync(filePath, newContent, 'utf8')
  console.log(`  [fix]  ${fileLabel} — removed: [${removed.join(', ')}], kept: [${goldOnly.join(', ')}]`)
}

const PROG_DIR = path.join(ROOT, 'data/programmatic')
const CAT_DIR = path.join(ROOT, 'data/category-pages')
const GUIDE_DIR = path.join(ROOT, 'data/guides')

// Mejores pages
updateFeaturedIds(path.join(PROG_DIR, 'mejores/auriculares-bluetooth.ts'), 'mejores/auriculares-bluetooth')
updateFeaturedIds(path.join(PROG_DIR, 'mejores/accesorios-gaming.ts'), 'mejores/accesorios-gaming')
updateFeaturedIds(path.join(PROG_DIR, 'mejores/gadgets-home-office.ts'), 'mejores/gadgets-home-office')
updateFeaturedIds(path.join(PROG_DIR, 'mejores/gadgets-amazon-colombia.ts'), 'mejores/gadgets-amazon-colombia')
updateFeaturedIds(path.join(PROG_DIR, 'mejores/regalos-tecnologicos.ts'), 'mejores/regalos-tecnologicos')

// Category pages
updateFeaturedIds(path.join(CAT_DIR, 'auriculares.ts'), 'category-pages/auriculares')
updateFeaturedIds(path.join(CAT_DIR, 'gaming.ts'), 'category-pages/gaming')
updateFeaturedIds(path.join(CAT_DIR, 'home-office.ts'), 'category-pages/home-office')
updateFeaturedIds(path.join(CAT_DIR, 'laptops.ts'), 'category-pages/laptops')

// Guides
updateProductIds(path.join(GUIDE_DIR, 'mejores-auriculares-bluetooth.ts'), 'guides/mejores-auriculares-bluetooth', 'productIds')
updateProductIds(path.join(GUIDE_DIR, 'gadgets-home-office-colombia.ts'), 'guides/gadgets-home-office-colombia', 'productIds')

// Check comparar pages — these reference productAId and productBId (single IDs, not arrays)
const COMP_DIR = path.join(PROG_DIR, 'comparar')
const comparFiles = [
  'airpods-pro-2-vs-galaxy-buds2-pro.ts',
  'ps5-dualsense-vs-xbox-controller.ts',
  'logitech-g502-vs-mx-master-3s.ts',
]

console.log('\n── Checking comparar pages ─────────────────────────────────────────')
for (const f of comparFiles) {
  const filePath = path.join(COMP_DIR, f)
  if (!fs.existsSync(filePath)) {
    console.log(`  [skip] ${f} not found`)
    continue
  }
  const content = fs.readFileSync(filePath, 'utf8')
  const idMatches = content.match(/product[AB]Id:\s*'([^']+)'/g)
  if (!idMatches) {
    console.log(`  [skip] ${f} — no product IDs found`)
    continue
  }
  const ids = idMatches.map(m => m.match(/'([^']+)'/)?.[1] ?? '')
  const allGold = ids.every(id => goldIds.has(id))
  console.log(`  ${allGold ? '[ok]' : '[DEAD]'} ${f} — [${ids.join(', ')}]${allGold ? '' : ' ← DEAD IDs!'}`)
}

// ── Remove orphaned pricing files ─────────────────────────────────────────────

console.log('\n── Cleaning pricing offers/snapshots ───────────────────────────────')

const offersDir = path.join(ROOT, 'data/pricing/offers')
const snapshotsDir = path.join(ROOT, 'data/pricing/snapshots')

function cleanPricingDir(dir: string, label: string): void {
  if (!fs.existsSync(dir)) {
    console.log(`  [skip] ${label} not found`)
    return
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
  let kept = 0, removed = 0

  for (const file of files) {
    const id = file.replace('.json', '')
    if (!goldIds.has(id)) {
      fs.unlinkSync(path.join(dir, file))
      removed++
    } else {
      kept++
    }
  }

  console.log(`  ${label}: kept ${kept}, removed ${removed}`)
}

cleanPricingDir(offersDir, 'pricing/offers')
cleanPricingDir(snapshotsDir, 'pricing/snapshots')

// ── Summary report ────────────────────────────────────────────────────────────

console.log('\n━━━ Catalog Replacement Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log()
console.log('  Category      | Products | Status')
console.log('  ─────────────────────────────────────')
for (const r of report) {
  const countStr = String(r.count).padEnd(8)
  console.log(`  ${r.category.padEnd(13)} | ${countStr} | ${r.status}`)
}
const total = report.reduce((s, r) => s + r.count, 0)
console.log('  ─────────────────────────────────────')
console.log(`  TOTAL         | ${total}`)
console.log()
console.log('  Next step: npx tsc --noEmit && npx next build')
