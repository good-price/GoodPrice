/**
 * FASE 3 — Title Intelligence: validación sobre muestra del Catalog V2
 * Run: npx tsx scripts/title-intelligence-sample.ts
 *
 * 20 productos seleccionados deliberadamente para cubrir:
 *  - 10 categorías completas
 *  - marcas compuestas (La Roche-Posay, Dr. Brown's, ARM & HAMMER, Love to Dream…)
 *  - modelos alfanuméricos (MD2380, G1, EDR1RXD1, SCY903)
 *  - productos con capacidad (20 oz, 30 oz, 37 lbs, 50 ft)
 *  - productos sin modelo evidente (ChomChom Roller, SURETIVIAN Shredder, waist trimmer)
 *  - títulos Amazon largos y con ruido (HP cartridge, Palmer's, Govee, everydrop)
 *  - caso sin brand en catálogo (Go Hang It! Pro)
 */

import { getRawProducts } from '@/data/catalog/index'
import { generateTitle }  from '@/lib/catalog/title-intelligence'

// ── Sample selection ───────────────────────────────────────────────────────────

const SAMPLE_IDS = [
  'elec-001',  // Mounting Dream TV Wall Mount MD2380       — tv-mount, alfanumérico
  'elec-002',  // TAGRY Bluetooth Earbuds                   — earbuds, sin modelo claro
  'game-001',  // Nintendo Joy-Con                          — controller, nombre compuesto
  'game-004',  // Super Mario Bros. Wonder                  — game, sin modelo
  'hogar-005', // Deconovo Blackout Curtains 52W x 84L     — curtains, dimensiones
  'hogar-013', // LEVOIT Tower Fan 36 inch                  — fan, especificaciones
  'coci-001',  // YETI Rambler 20 oz Tumbler                — tumbler, capacidad
  'coci-003',  // SURETIVIAN Chicken Shredder               — shredder-tool, marca rara
  'ofic-001',  // HP 67XL Ink Cartridge (título con ruido)  — ink-cartridge, alfanumérico
  'ofic-003',  // Everlasting Comfort Seat Cushion          — seat-cushion, marca compuesta
  'dep-001',   // Sports Research Sweet Sweat Waist Trimmer — sin productType, marca compuesta
  'dep-006',   // ZIONOR Swim Goggles G1                   — goggles, alfanumérico
  'bel-001',   // La Roche-Posay Toleriane Moisturizer      — moisturizer, marca compuesta larga
  'bel-002',   // Palmer's Cocoa Butter Stretch Marks Kit   — stretch-marks, marca con apóstrofe
  'beb-003',   // Dr. Brown's Anti-Colic Baby Bottle        — baby-bottle, marca compuesta con punto
  'beb-005',   // Love to Dream Swaddle UP 8-13lbs          — swaddle, marca de 3 palabras + talla
  'masc-001',  // ChomChom Roller Pet Hair Remover          — lint-roller, sin modelo
  'masc-005',  // ARM & HAMMER Clump & Seal Cat Litter      — cat-litter, marca con ampersands
  'herr-001',  // everydrop by Whirlpool Filter EDR1RXD1   — water-filter, brand en minúscula
  'herr-011',  // Go Hang It! Pro Picture Hanging Kit       — sin productType, sin brand
]

// ── Run ────────────────────────────────────────────────────────────────────────

const all     = getRawProducts()
const byId    = new Map(all.map(p => [p.id, p]))
const sample  = SAMPLE_IDS.map(id => byId.get(id)).filter(Boolean) as typeof all

if (sample.length !== SAMPLE_IDS.length) {
  const missing = SAMPLE_IDS.filter(id => !byId.has(id))
  console.error('IDs no encontrados:', missing)
  process.exit(1)
}

// ── Output ─────────────────────────────────────────────────────────────────────

console.log('\n=== GOODPRICE — TITLE INTELLIGENCE V1 — FASE 3 ===\n')

const COL = { CAT: 14, TITLE: 65, CONF: 8 }

function pad(s: string, n: number) {
  return s.length >= n ? s.slice(0, n - 1) + '…' : s.padEnd(n)
}

console.log(`${'#'.padEnd(3)} ${'Categoría'.padEnd(COL.CAT)} ${'amazonTitle (truncado)'.padEnd(COL.TITLE)} ${'title generado'.padEnd(COL.TITLE)} ${'shortTitle'.padEnd(22)} Conf`)
console.log('─'.repeat(3 + 1 + COL.CAT + 1 + COL.TITLE + 1 + COL.TITLE + 1 + 22 + 1 + 5))

const results: Array<{ product: typeof sample[0]; output: ReturnType<typeof generateTitle> }> = []

sample.forEach((p, i) => {
  const output = generateTitle({
    amazonTitle: p.title,
    category:    p.category as any,
    brand:       p.brand,
  })
  results.push({ product: p, output })

  const num  = String(i + 1).padEnd(2)
  const cat  = pad(p.category, COL.CAT)
  const orig = pad(p.title, COL.TITLE)
  const gen  = pad(output.title, COL.TITLE)
  const sh   = pad(output.shortTitle, 22)
  const conf = output.confidence.toFixed(2)

  console.log(`${num} ${cat} ${orig} ${gen} ${sh} ${conf}`)
})

// ── Detailed view ─────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(100))
console.log('DETALLE COMPLETO')
console.log('═'.repeat(100))

results.forEach(({ product: p, output }, i) => {
  console.log(`\n[${i + 1}] ${p.id} — ${p.category.toUpperCase()}`)
  console.log(`  amazonTitle  : ${output.amazonTitle}`)
  console.log(`  title        : ${output.title}`)
  console.log(`  shortTitle   : ${output.shortTitle}`)
  console.log(`  confidence   : ${output.confidence.toFixed(2)}`)
  console.log(`  brand (cat.) : ${p.brand ?? '—'}`)
})

console.log('\n' + '─'.repeat(100))
console.log(`Total: ${results.length} productos procesados`)
