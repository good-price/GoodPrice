/**
 * FASE 5A — Title Intelligence: generación del artefacto de migración
 * Run: npx tsx scripts/title-migration-generate.ts
 *
 * NO modifica ningún archivo del catálogo.
 * Genera:
 *   data/catalog-title-migration.json
 *   data/catalog-title-migration-report.json
 */

import fs   from 'fs'
import path from 'path'
import { getRawProducts } from '@/data/catalog/index'
import { generateTitle }  from '@/lib/catalog/title-intelligence'

// ── Load catalog ───────────────────────────────────────────────────────────────

const raw = getRawProducts().filter(p => p.status === 'active')

// ── Validations pre-run ────────────────────────────────────────────────────────

const ids   = raw.map(p => p.id)
const asins = raw.map(p => p.asin)

function findDuplicates(arr: (string | undefined)[]): string[] {
  const seen = new Set<string>()
  const dupes: string[] = []
  for (const v of arr) {
    if (!v) continue
    if (seen.has(v)) dupes.push(v)
    seen.add(v)
  }
  return dupes
}

const dupIds   = findDuplicates(ids)
const dupAsins = findDuplicates(asins)

if (dupIds.length)   { console.error('DUPLICATE IDs:',   dupIds);   process.exit(1) }
if (dupAsins.length) { console.error('DUPLICATE ASINs:', dupAsins); process.exit(1) }
if (raw.length !== 99) {
  console.error(`Expected 99 active products, found ${raw.length}`)
  process.exit(1)
}

// ── Generate titles ────────────────────────────────────────────────────────────

type MigrationProduct = {
  id:          string
  asin:        string
  category:    string
  amazonTitle: string
  title:       string
  shortTitle:  string
  confidence:  number
}

const errors: string[] = []
const products: MigrationProduct[] = []

for (const p of raw) {
  try {
    const out = generateTitle({
      amazonTitle: p.title,
      category:    p.category as any,
      brand:       p.brand,
    })
    products.push({
      id:          p.id ?? '',
      asin:        p.asin ?? '',
      category:    p.category,
      amazonTitle: out.amazonTitle,
      title:       out.title,
      shortTitle:  out.shortTitle,
      confidence:  out.confidence,
    })
  } catch (err) {
    errors.push(`${p.id}: ${String(err)}`)
  }
}

if (errors.length) {
  console.error('ERRORS during generation:', errors)
  process.exit(1)
}

// ── Post-run validations ───────────────────────────────────────────────────────

if (products.length !== 99)          { console.error(`Generated ${products.length} ≠ 99`); process.exit(1) }
if (products.some(p => !p.title))    { console.error('Some titles are empty');              process.exit(1) }
if (products.some(p => !p.shortTitle)){ console.error('Some shortTitles are empty');        process.exit(1) }

// ── Write migration artifact ───────────────────────────────────────────────────

const outDir = path.join(process.cwd(), 'data')

const migration = {
  generatedAt:   new Date().toISOString(),
  totalProducts: products.length,
  products,
}

fs.writeFileSync(
  path.join(outDir, 'catalog-title-migration.json'),
  JSON.stringify(migration, null, 2),
  'utf-8',
)

// ── Report generation ──────────────────────────────────────────────────────────

// Confidence distribution
const dist = {
  gte95:    products.filter(p => p.confidence >= 0.95).length,
  from90to94: products.filter(p => p.confidence >= 0.90 && p.confidence < 0.95).length,
  from85to89: products.filter(p => p.confidence >= 0.85 && p.confidence < 0.90).length,
  lt85:     products.filter(p => p.confidence < 0.85).length,
}

// Top 20 best
const top20best = [...products]
  .sort((a, b) => b.confidence - a.confidence)
  .slice(0, 20)
  .map(p => ({ id: p.id, category: p.category, amazonTitle: p.amazonTitle, title: p.title, shortTitle: p.shortTitle, confidence: p.confidence }))

// Top 20 weakest
const top20weak = [...products]
  .sort((a, b) => a.confidence - b.confidence)
  .slice(0, 20)
  .map(p => ({ id: p.id, category: p.category, amazonTitle: p.amazonTitle, title: p.title, shortTitle: p.shortTitle, confidence: p.confidence }))

// Summary by category
const categories = [...new Set(products.map(p => p.category))].sort()
const byCat = categories.map(cat => {
  const group = products.filter(p => p.category === cat)
  const confs = group.map(p => p.confidence)
  const avg   = confs.reduce((s, c) => s + c, 0) / confs.length
  return {
    category:   cat,
    count:      group.length,
    avgConf:    Math.round(avg * 100) / 100,
    minConf:    Math.min(...confs),
    maxConf:    Math.max(...confs),
  }
})

const report = {
  generatedAt:            new Date().toISOString(),
  totalProducts:          products.length,
  confidenceDistribution: {
    'gte_095':     dist.gte95,
    '090_to_094':  dist.from90to94,
    '085_to_089':  dist.from85to89,
    'lt_085':      dist.lt85,
  },
  summaryByCategory:      byCat,
  top20best,
  top20weakest:           top20weak,
}

fs.writeFileSync(
  path.join(outDir, 'catalog-title-migration-report.json'),
  JSON.stringify(report, null, 2),
  'utf-8',
)

// ── Console summary ────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(80))
console.log('  GOODPRICE — TITLE INTELLIGENCE V1 — FASE 5A: MIGRACIÓN CONTROLADA')
console.log('═'.repeat(80))
console.log(`\n  ✓ ${products.length} productos procesados`)
console.log(`  ✓ ${products.length} títulos generados`)
console.log(`  ✓ ${products.length} shortTitles generados`)
console.log(`  ✓ 0 errores`)
console.log(`  ✓ 0 IDs duplicados`)
console.log(`  ✓ 0 ASINs duplicados`)

console.log('\n── DISTRIBUCIÓN DE CONFIDENCE ──────────────────────────────────────────────')
const pct = (n: number) => `${n} (${Math.round(n / 99 * 100)}%)`
console.log(`  >= 0.95        : ${pct(dist.gte95)}`)
console.log(`  0.90 - 0.94    : ${pct(dist.from90to94)}`)
console.log(`  0.85 - 0.89    : ${pct(dist.from85to89)}`)
console.log(`  < 0.85         : ${pct(dist.lt85)}`)

console.log('\n── RESUMEN POR CATEGORÍA ────────────────────────────────────────────────────')
const H = { cat: 14, n: 6, avg: 8, min: 8, max: 8 }
console.log(`  ${'Categoría'.padEnd(H.cat)} ${'N'.padEnd(H.n)} ${'Avg'.padEnd(H.avg)} ${'Min'.padEnd(H.min)} ${'Max'.padEnd(H.max)}`)
console.log('  ' + '─'.repeat(H.cat + H.n + H.avg + H.min + H.max + 4))
for (const r of byCat) {
  console.log(
    `  ${r.category.padEnd(H.cat)} ${String(r.count).padEnd(H.n)} ${String(r.avgConf).padEnd(H.avg)} ${String(r.minConf).padEnd(H.min)} ${String(r.maxConf).padEnd(H.max)}`
  )
}

console.log('\n── TOP 10 MEJORES TRANSFORMACIONES ─────────────────────────────────────────')
top20best.slice(0, 10).forEach((p, i) => {
  console.log(`\n  [${String(i + 1).padStart(2)}] ${p.id} (${p.category}) — conf: ${p.confidence}`)
  console.log(`       amazon    : ${p.amazonTitle.slice(0, 90)}${p.amazonTitle.length > 90 ? '…' : ''}`)
  console.log(`       title     : ${p.title}`)
  console.log(`       shortTitle: ${p.shortTitle}`)
})

console.log('\n── TOP 10 TRANSFORMACIONES MÁS DÉBILES ─────────────────────────────────────')
top20weak.slice(0, 10).forEach((p, i) => {
  console.log(`\n  [${String(i + 1).padStart(2)}] ${p.id} (${p.category}) — conf: ${p.confidence}`)
  console.log(`       amazon    : ${p.amazonTitle.slice(0, 90)}${p.amazonTitle.length > 90 ? '…' : ''}`)
  console.log(`       title     : ${p.title}`)
  console.log(`       shortTitle: ${p.shortTitle}`)
})

const avgAll = Math.round(products.reduce((s, p) => s + p.confidence, 0) / products.length * 100) / 100
console.log('\n── RESUMEN EJECUTIVO ────────────────────────────────────────────────────────')
console.log(`  Productos procesados : 99/99`)
console.log(`  Confidence promedio  : ${avgAll}`)
console.log(`  EXCELENTE (>= 0.95)  : ${dist.gte95} productos (${Math.round(dist.gte95 / 99 * 100)}%)`)
console.log(`  BUENO     (>= 0.85)  : ${dist.from90to94 + dist.from85to89} productos (${Math.round((dist.from90to94 + dist.from85to89) / 99 * 100)}%)`)
console.log(`  DEBIL     (< 0.85)   : ${dist.lt85} productos (${Math.round(dist.lt85 / 99 * 100)}%)`)

console.log('\n  Artefactos generados:')
console.log('    data/catalog-title-migration.json')
console.log('    data/catalog-title-migration-report.json')
console.log('\n' + '═'.repeat(80))
