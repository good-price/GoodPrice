/**
 * Unit tests for lib/catalog/title-intelligence/
 * Run: npx tsx scripts/title-intelligence-test.ts
 */

import { generateTitle } from '@/lib/catalog/title-intelligence'
import { removeNoise }    from '@/lib/catalog/title-intelligence/noise'
import { detectProductType } from '@/lib/catalog/title-intelligence/product-type'
import { extractAttributes } from '@/lib/catalog/title-intelligence/extractor'

let passed = 0
let failed = 0

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

function suite(name: string, fn: () => void) {
  console.log(`\n${name}`)
  fn()
}

// ── removeNoise ───────────────────────────────────────────────────────────────

suite('removeNoise', () => {
  const r1 = removeNoise('HP 67XL Black High-Yield Ink Cartridge | Works with DeskJet 1255 | Eligible for Instant Ink | 3YM57AN | Packaging May Vary')
  assert('strips "Eligible for Instant Ink"', !r1.toLowerCase().includes('eligible for instant ink'), r1)
  assert('strips "Packaging May Vary"',       !r1.toLowerCase().includes('packaging may vary'), r1)

  const r2 = removeNoise('Sony WH-1000XM5 Wireless Headphones for Men and Women, Black')
  assert('strips "for Men and Women"', !r2.toLowerCase().includes('for men and women'), r2)

  const r3 = removeNoise('Hammermill Printer Paper, 20 lb Copy, 8.5 x 11 - 8 Ream (4,000 Sheets) - 92 Bright, Made in the USA')
  assert('strips "Made in the USA"', !r3.toLowerCase().includes('made in the usa'), r3)

  const r4 = removeNoise('Product Name | B07MCYDD62')
  assert('strips trailing SKU-like pipe segment', !r4.includes('B07MCYDD62'), r4)
})

// ── detectProductType ─────────────────────────────────────────────────────────

suite('detectProductType', () => {
  assert('headphones',    detectProductType('Sony WH-1000XM5 Wireless Noise Canceling Headphones') === 'headphones')
  assert('earbuds',       detectProductType('TAGRY Bluetooth True Wireless Earbuds 60H Playback') === 'earbuds')
  assert('ssd',           detectProductType('Samsung T7 Portable SSD 1TB') === 'ssd')
  assert('mouse',         detectProductType('Logitech MX Master 3S Wireless Performance Mouse') === 'mouse')
  assert('controller',    detectProductType('Nintendo Joy-Con (L)/(R) Controller') === 'controller')
  assert('ink-cartridge', detectProductType('HP 67XL Black High-Yield Ink Cartridge') === 'ink-cartridge')
  assert('tumbler',       detectProductType('YETI Rambler 20 oz Stainless Steel Tumbler') === 'tumbler')
  assert('cat-litter',    detectProductType('ARM & HAMMER Clump & Seal SLIDE Platinum Multi-Cat Clumping Cat Litter') === 'cat-litter')
  assert('diapers',       detectProductType('Pampers Swaddlers Newborn Diapers Size 0') === 'diapers')
  assert('curtains',      detectProductType('Deconovo Navy Blue Blackout Curtains 2 Panel Set') === 'curtains')
  assert('unknown → null',detectProductType('Random Product With No Keywords') === null)
})

// ── extractAttributes ─────────────────────────────────────────────────────────

suite('extractAttributes', () => {
  const a1 = extractAttributes('Sony WH-1000XM5 Wireless Noise Canceling Headphones', 'Sony', 'electronica')
  assert('brand from override',  a1.brand === 'Sony', a1.brand)
  assert('model WH-1000XM5',     a1.model === 'WH-1000XM5', a1.model)
  assert('productType headphones',a1.productType === 'headphones')

  const a2 = extractAttributes('Samsung T7 Portable SSD 1TB', 'Samsung', 'electronica')
  assert('model T7',            a2.model === 'T7', a2.model)
  assert('variant 1TB',         a2.variant === '1TB', a2.variant)
  assert('productType ssd',     a2.productType === 'ssd')

  const a3 = extractAttributes('YETI Rambler 20 oz Stainless Steel Vacuum Insulated Tumbler', 'YETI', 'cocina')
  assert('variant 20 oz',        a3.variant.includes('20'), `"${a3.variant}"`)
  assert('productType tumbler',  a3.productType === 'tumbler')
  assert('productLine Rambler',  a3.productLine === 'Rambler', a3.productLine)

  const a4 = extractAttributes('ChomChom Roller Pet Hair Remover', 'ChomChom', 'mascotas')
  assert('brand ChomChom',           a4.brand === 'ChomChom')
  assert('productType lint-roller',  a4.productType === 'lint-roller')

  const a5 = extractAttributes('Everlasting Comfort Doctor Recommended Memory Foam Seat Cushion for Office Chairs', 'Everlasting Comfort', 'oficina')
  assert('seat-cushion not microphone', a5.productType === 'seat-cushion', `got: ${a5.productType}`)

  const a6 = extractAttributes('SURETIVIAN Chicken Shredder Tool Twist Large Chicken Breast Shredder with Brush & Fork, Ergonomic Handle', 'SURETIVIAN', 'cocina')
  assert('shredder-tool not microphone', a6.productType === 'shredder-tool', `got: ${a6.productType}`)
})

// ── generateTitle (integration) ───────────────────────────────────────────────

suite('generateTitle — output shape', () => {
  const cases: Array<{ title: string; category: Parameters<typeof generateTitle>[0]['category']; brand: string }> = [
    { title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones', category: 'electronica', brand: 'Sony' },
    { title: 'Samsung T7 Portable SSD 1TB - Up to 1050MB/s, USB 3.2', category: 'electronica', brand: 'Samsung' },
    { title: 'Logitech MX Master 3S Wireless Performance Mouse', category: 'electronica', brand: 'Logitech' },
    { title: 'YETI Rambler 20 oz Stainless Steel Vacuum Insulated Tumbler w/MagSlider Lid', category: 'cocina', brand: 'YETI' },
    { title: 'Nintendo Joy-Con (L)/(R) Controller, Black', category: 'gaming', brand: 'Nintendo' },
    { title: 'HP 67XL Black High-Yield Ink Cartridge | Eligible for Instant Ink | Packaging May Vary', category: 'oficina', brand: 'HP' },
    { title: 'Pampers Swaddlers Newborn Diapers Size 0, 140 Count', category: 'bebes', brand: 'Pampers' },
    { title: 'ARM & HAMMER Clump & Seal SLIDE Multi-Cat Clumping Cat Litter, 37 lbs', category: 'mascotas', brand: 'ARM & HAMMER' },
    { title: 'Deconovo Navy Blue Blackout Curtains 2 Panel Set, 52W x 84L Inch', category: 'hogar', brand: 'Deconovo' },
  ]

  for (const c of cases) {
    const out = generateTitle({ amazonTitle: c.title, category: c.category, brand: c.brand })

    assert(`[${c.brand}] amazonTitle preserved`,   out.amazonTitle === c.title)
    assert(`[${c.brand}] title includes brand`,    out.title.includes(c.brand), out.title)
    assert(`[${c.brand}] title includes "–"`,      out.title.includes('–'), out.title)
    assert(`[${c.brand}] shortTitle non-empty`,    out.shortTitle.length > 0, out.shortTitle)
    assert(`[${c.brand}] confidence 0–1`,          out.confidence >= 0 && out.confidence <= 1, String(out.confidence))
  }
})

// ── Confidence thresholds ─────────────────────────────────────────────────────

suite('generateTitle — confidence levels', () => {
  const high = generateTitle({ amazonTitle: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones', category: 'electronica', brand: 'Sony' })
  assert('Sony WH-1000XM5 confidence ≥ 0.90', high.confidence >= 0.90, String(high.confidence))

  const mid = generateTitle({ amazonTitle: 'TAGRY Bluetooth Headphones True Wireless Earbuds 60H Playback', category: 'electronica', brand: 'TAGRY' })
  assert('TAGRY earbuds confidence ≥ 0.75', mid.confidence >= 0.75, String(mid.confidence))
})

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`Tests: ${passed + failed} total  |  ${passed} passed  |  ${failed} failed`)
if (failed > 0) process.exit(1)
