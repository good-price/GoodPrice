/**
 * scripts/strategic-ranking.mjs
 *
 * Reanaliza candidate-expansion.json con commercialScore enfocado en GOODPRICE.
 * Genera 4 rankings estratégicos: general, comparativas, SEO, monetización.
 *
 * Guarda: data/strategic-ranking.json
 * Solo lectura — NO modifica el catálogo.
 *
 * Usage: node scripts/strategic-ranking.mjs
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RATE = 4100

// ── Data ───────────────────────────────────────────────────────────────────────

const raw = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/candidate-expansion.json'), 'utf8')
)

// ── Price extraction ───────────────────────────────────────────────────────────

function parseRealUSD(c) {
  if (c.priceRaw) {
    const cop = c.priceRaw.match(/COP\s*([\d,. ]+)/)
    if (cop) {
      const n = parseFloat(cop[1].replace(/[\s,]/g, '').replace(/\.(\d{2})$/, '.$1'))
      if (!isNaN(n) && n > 0) return Math.round(n / RATE * 100) / 100
    }
    const usd = c.priceRaw.match(/\$\s*([\d,.]+)/)
    if (usd) return parseFloat(usd[1].replace(',', ''))
  }
  return null
}

// ── Keyword sets ───────────────────────────────────────────────────────────────

const STRONG_TECH = [
  'bluetooth', 'wireless', 'wi-fi', 'wifi', 'smart home', 'smartwatch',
  'monitor', 'webcam', 'keyboard', 'mouse', 'headphone', 'headset', 'earbuds',
  'speaker', 'microphone', 'gaming', 'controller', 'console', 'ps5', 'xbox',
  'nintendo', 'ssd', 'nvme', 'hard drive', 'charger', 'power bank', 'laptop',
  'tablet', 'ring light', 'security camera', 'doorbell', 'thermostat',
  'echo', 'fire tv', 'alexa', 'kindle', 'gpu', 'cpu', 'ram',
  '4k', 'oled', 'qled', 'usb-c', 'usb hub', 'hdmi', 'docking',
  'mechanical', 'rgb', 'streamer', 'capture card',
]

const MODERATE_TECH = [
  'ergonomic', 'standing desk', 'fitness tracker', 'heart rate', 'gps',
  'smart plug', 'light strip', 'led strip', 'bulb', 'scale digital',
  'air purifier', 'humidifier', 'projector', 'noise cancel', 'anc',
  'tws', 'true wireless', 'usb', 'adapter', 'hub', 'stand',
  'tripod', 'mount', 'arm', 'cable management',
]

const PREMIUM_SIGNALS = [
  ' pro ', ' max ', ' ultra ', ' plus ', ' elite ', ' premium ',
  '4k', 'professional', 'studio', 'titanium', 'carbon', 'aluminum',
  'mechanical', 'optical', 'laser', 'magnetic',
]

const CONSUMABLE_STRONG = [
  'wipes', 'diaper', 'poop bag', 'refill', 'replacement filter',
  'ink cartridge', 'toner', 'printer paper', 'packing tape',
  'trash bag', 'garbage bag', 'zip bag', 'dog food', 'cat food',
  'baby food', 'pet food', 'cat litter', 'dog treat', 'cat treat',
  'facial pad', 'cotton pad', 'makeup remover', 'shampoo', 'conditioner',
  'body wash', 'toothpaste', 'razor blade', 'aa batteries', 'aaa batteries',
  'dryer sheet', 'laundry pod', 'dish soap', 'detergent',
]

const CONSUMABLE_MODERATE = [
  ' bags', ' filter', ' pack of', ' count)', '-count', '-pack',
  'air filter', 'water filter', 'hvac', 'furnace filter', 'merv',
  'laminating sheet', 'sheet protector', 'copy paper',
  'spray paint', 'scotch tape', 'duct tape', 'masking tape',
  'pet pad', 'puppy pad', 'pet wipe', 'flea', 'tick',
  'vitamin', 'supplement', 'protein powder',
]

// Categories with inherent commercial value for GOODPRICE
const CATEGORY_WEIGHT = {
  electronica:  20,
  gaming:       20,
  hogar:        18,
  deporte:      10,
  oficina:      8,
  cocina:       5,
  belleza:      4,
  herramientas: 3,
  mascotas:     2,
  bebes:        2,
}

// Categories best for comparativas
const COMPARISON_POTENTIAL = {
  electronica:  25,
  gaming:       25,
  hogar:        18,
  deporte:      12,
  oficina:      10,
  cocina:       8,
  belleza:      5,
  herramientas: 4,
  mascotas:     2,
  bebes:        1,
}

// Products with explicit spec-comparison keywords
const COMPARISON_PRODUCT_TYPES = [
  'monitor', 'keyboard', 'mouse', 'headphone', 'headset', 'webcam',
  'speaker', 'earbuds', 'microphone', 'controller', 'gaming', 'ssd',
  'hub', 'charger', 'power bank', 'laptop stand', 'ergonomic',
  'smartwatch', 'fitness tracker', 'security camera', 'projector',
  'ring light', 'capture card', 'mechanical', 'noise cancel',
  'streaming', 'tripod', 'gimbal', 'stabilizer',
]

// ── Scoring ────────────────────────────────────────────────────────────────────

function titleLower(c) {
  return (c.title ?? '').toLowerCase()
}

function hasKeyword(title, keywords) {
  return keywords.some(k => title.includes(k))
}

function countKeywords(title, keywords) {
  return keywords.filter(k => title.includes(k)).length
}

function computeCommercialScore(c, usd) {
  const title = titleLower(c)
  const breakdown = []
  let score = 0

  // 1. Category base weight (0-20)
  const catW = CATEGORY_WEIGHT[c.category] ?? 0
  score += catW
  if (catW > 0) breakdown.push(`cat:${c.category} (+${catW})`)

  // 2. Tech keyword bonuses (0-30)
  if (hasKeyword(title, STRONG_TECH)) {
    score += 25
    breakdown.push('strong-tech (+25)')
  } else if (hasKeyword(title, MODERATE_TECH)) {
    score += 12
    breakdown.push('moderate-tech (+12)')
  }

  // Premium signal (stacks)
  if (hasKeyword(title, PREMIUM_SIGNALS)) {
    score += 6
    breakdown.push('premium-signal (+6)')
  }

  // Multiple tech keyword stack (up to +5 extra)
  const techCount = countKeywords(title, [...STRONG_TECH, ...MODERATE_TECH])
  if (techCount >= 3) { score += 5; breakdown.push('multi-tech (+5)') }
  else if (techCount === 2) { score += 2; breakdown.push('dual-tech (+2)') }

  // 3. USD price tier (-10 to +20)
  if (usd !== null) {
    if (usd > 150)        { score += 20; breakdown.push(`price $${usd} tier-5 (+20)`) }
    else if (usd > 75)    { score += 18; breakdown.push(`price $${usd} tier-4 (+18)`) }
    else if (usd > 30)    { score += 12; breakdown.push(`price $${usd} tier-3 (+12)`) }
    else if (usd > 15)    { score +=  5; breakdown.push(`price $${usd} tier-2 (+5)`) }
    else if (usd > 8)     { score +=  0; breakdown.push(`price $${usd} tier-1 (0)`) }
    else                  { score -= 10; breakdown.push(`price $${usd} low (-10)`) }
  } else {
    // No price → neutral
    breakdown.push('no-price (0)')
  }

  // 4. Consumable penalty (-30 to 0)
  if (hasKeyword(title, CONSUMABLE_STRONG)) {
    score -= 30
    breakdown.push('consumable-strong (-30)')
  } else if (hasKeyword(title, CONSUMABLE_MODERATE)) {
    score -= 18
    breakdown.push('consumable-moderate (-18)')
  }

  // Category consumable penalty
  if (c.category === 'bebes' && !hasKeyword(title, STRONG_TECH)) {
    score -= 15
    breakdown.push('bebes-consumable (-15)')
  }
  if (c.category === 'mascotas' && !hasKeyword(title, STRONG_TECH)) {
    if (!title.includes('automatic') && !title.includes('smart') && !title.includes('camera')) {
      score -= 12
      breakdown.push('mascotas-consumable (-12)')
    }
  }

  // 5. Review credibility (+0 to +5) — lighter weight
  if (c.reviewCount >= 50_000)    { score += 5; breakdown.push('reviews-massive (+5)') }
  else if (c.reviewCount >= 10_000) { score += 3; breakdown.push('reviews-high (+3)') }
  else if (c.reviewCount >= 1_000)  { score += 1; breakdown.push('reviews-ok (+1)') }

  // 6. Rating quality (+0 to +5)
  if (c.rating >= 4.7)      { score += 5; breakdown.push(`rating ${c.rating} (+5)`) }
  else if (c.rating >= 4.5) { score += 3; breakdown.push(`rating ${c.rating} (+3)`) }
  else if (c.rating >= 4.3) { score += 1; breakdown.push(`rating ${c.rating} (+1)`) }

  // 7. BSR signal (+1 to +8)
  if (c.bsrRank <= 10)       { score += 8; breakdown.push('bsr-top10 (+8)') }
  else if (c.bsrRank <= 25)  { score += 5; breakdown.push('bsr-top25 (+5)') }
  else if (c.bsrRank <= 50)  { score += 3; breakdown.push('bsr-top50 (+3)') }
  else                       { score += 1; breakdown.push('bsr-50+ (+1)') }

  return { score: Math.min(100, Math.max(0, score)), breakdown }
}

function computeComparativaScore(c, usd, commercialScore) {
  const title = titleLower(c)
  let score = commercialScore

  // Extra boost for products with multiple competitors
  const compMatch = countKeywords(title, COMPARISON_PRODUCT_TYPES)
  score += compMatch * 8

  // Category comparison potential
  const catComp = COMPARISON_POTENTIAL[c.category] ?? 0
  score += catComp * 0.5

  // Price in comparativa-friendly range ($20-$400)
  if (usd !== null && usd >= 20 && usd <= 400) score += 10

  // Strong penalty if consumable (not comparable)
  if (hasKeyword(title, CONSUMABLE_STRONG) || hasKeyword(title, CONSUMABLE_MODERATE)) {
    score -= 25
  }

  return Math.min(100, Math.max(0, score))
}

function computeSEOScore(c, usd, commercialScore) {
  const title = titleLower(c)
  let score = commercialScore

  // High search-intent proxy: tech products people research before buying
  if (hasKeyword(title, STRONG_TECH)) score += 15
  if (hasKeyword(title, MODERATE_TECH)) score += 8

  // Products with brand + model in title (better long-tail SEO)
  const hasBrand = /\b(anker|logitech|razer|corsair|steelseries|hyperx|sony|bose|jbl|samsung|lg|asus|msi|amazon|fire|echo|kindle|ring|tp-link|kasa|govee|wyze|eufy)\b/.test(title)
  if (hasBrand) score += 12

  // Unique/specific product (not generic): longer titles with specifics
  if (c.title.length > 60) score += 5

  // High review count = proven search demand
  if (c.reviewCount >= 50_000) score += 8
  else if (c.reviewCount >= 10_000) score += 4

  // Price range where people research ($25+)
  if (usd !== null && usd >= 25) score += 5

  // Penalty for consumables (low research intent)
  if (hasKeyword(title, CONSUMABLE_STRONG)) score -= 20
  if (hasKeyword(title, CONSUMABLE_MODERATE)) score -= 12

  return Math.min(100, Math.max(0, score))
}

function round2(n) { return Math.round(n * 100) / 100 }

function computeMonetizacionScore(c, usd, commercialScore) {
  const title = titleLower(c)
  let score = 0

  // Core: commission value = price tier (most important factor)
  if (usd !== null) {
    if (usd > 200)        score += 40
    else if (usd > 100)   score += 32
    else if (usd > 50)    score += 24
    else if (usd > 25)    score += 15
    else if (usd > 15)    score += 8
    else                  score += 2
  }

  // Commercial score adds context
  score += commercialScore * 0.35

  // Traffic potential: reviews × rating
  if (c.reviewCount && c.rating) {
    const traffic = Math.log10(c.reviewCount) * c.rating
    score += Math.min(15, traffic * 1.2)
  }

  // One-time purchase bonus (not consumable) = meaningful per-sale commission
  if (!hasKeyword(title, CONSUMABLE_STRONG) && !hasKeyword(title, CONSUMABLE_MODERATE)) {
    score += 10
  }

  // BSR signal (high BSR = volume purchases)
  if (c.bsrRank <= 10) score += 8
  else if (c.bsrRank <= 25) score += 5

  return round2(Math.min(100, Math.max(0, score)))
}

// ── Process all candidates ─────────────────────────────────────────────────────

const analyzed = raw.candidates.map(c => {
  const usd = parseRealUSD(c)
  const { score: cScore, breakdown } = computeCommercialScore(c, usd)
  const compScore  = computeComparativaScore(c, usd, cScore)
  const seoScore   = computeSEOScore(c, usd, cScore)
  const monScore   = computeMonetizacionScore(c, usd, cScore)

  return {
    asin:             c.asin,
    title:            c.title,
    category:         c.category,
    categoryLabel:    c.categoryLabel,
    bsrRank:          c.bsrRank,
    rating:           c.rating,
    reviewCount:      c.reviewCount,
    priceUSD:         usd,
    priceRaw:         c.priceRaw,
    pageUrl:          c.pageUrl,
    commercialScore:  cScore,
    comparativaScore: compScore,
    seoScore:         seoScore,
    monetizacionScore: monScore,
    scoreBreakdown:   breakdown,
  }
})

// ── Generate ranked lists ──────────────────────────────────────────────────────

const top50General = [...analyzed]
  .sort((a, b) => b.commercialScore - a.commercialScore || b.reviewCount - a.reviewCount)
  .slice(0, 50)

const top20Comparativas = [...analyzed]
  .sort((a, b) => b.comparativaScore - a.comparativaScore || b.reviewCount - a.reviewCount)
  .slice(0, 20)

const top20SEO = [...analyzed]
  .sort((a, b) => b.seoScore - a.seoScore || b.reviewCount - a.reviewCount)
  .slice(0, 20)

const top20Monetizacion = [...analyzed]
  .sort((a, b) => b.monetizacionScore - a.monetizacionScore || (b.priceUSD ?? 0) - (a.priceUSD ?? 0))
  .slice(0, 20)

// ── Save ───────────────────────────────────────────────────────────────────────

const output = {
  generatedAt: new Date().toISOString(),
  totalAnalyzed: analyzed.length,
  top50General,
  top20Comparativas,
  top20SEO,
  top20Monetizacion,
}

fs.writeFileSync(
  path.join(__dirname, '../data/strategic-ranking.json'),
  JSON.stringify(output, null, 2),
  'utf8'
)

// ── Console report ─────────────────────────────────────────────────────────────

const COL = { asin: 12, score: 6, price: 8, rev: 10, cat: 13, title: 42 }
const row = (rank, asin, score, price, rev, cat, title) =>
  ` ${String(rank).padStart(2)}  ${String(asin).padEnd(COL.asin)}  ${String(score).padStart(COL.score)}  ${String(price).padStart(COL.price)}  ${String(rev).padStart(COL.rev)}  ${String(cat).padEnd(COL.cat)}  ${String(title).slice(0, COL.title)}`

const header = (scoreLabel) =>
  row('#', 'ASIN', scoreLabel, 'USD', 'Reviews', 'Categoría', 'Título') + '\n' +
  ' ' + '─'.repeat(110)

function printList(title, list, scoreField) {
  console.log(`\n━━━ ${title} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(header(scoreField))
  list.forEach((c, i) => {
    const price  = c.priceUSD ? `$${c.priceUSD.toFixed(0)}` : '—'
    const reviews = c.reviewCount ? c.reviewCount.toLocaleString('es') : '—'
    console.log(row(i + 1, c.asin, c[scoreField], price, reviews, c.category, c.title))
  })
}

console.log('\n━━━ GOODPRICE Strategic Ranking ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  Analizados: ${analyzed.length} candidatos de candidate-expansion.json`)
console.log(`  Tasa COP→USD: ${RATE}`)

// Category breakdown of top-50
const catBreak50 = {}
for (const c of top50General) catBreak50[c.category] = (catBreak50[c.category] ?? 0) + 1
console.log('\n  Distribución top-50 por categoría:')
for (const [cat, n] of Object.entries(catBreak50).sort((a,b) => b[1]-a[1])) {
  console.log(`    ${cat.padEnd(14)} ${n}`)
}

printList('TOP 50 — commercialScore (GOODPRICE focus)', top50General, 'commercialScore')
printList('TOP 20 — comparativaScore', top20Comparativas, 'comparativaScore')
printList('TOP 20 — seoScore', top20SEO, 'seoScore')
printList('TOP 20 — monetizacionScore', top20Monetizacion, 'monetizacionScore')

console.log('\n\n  Archivo guardado: data/strategic-ranking.json\n')
