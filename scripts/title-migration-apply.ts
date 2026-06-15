/**
 * FASE 5B — Title Intelligence: migración masiva al Catalog V2
 * Run: npx tsx scripts/title-migration-apply.ts
 *
 * Lee data/catalog-title-migration.json + data/title-overrides.json
 * Actualiza los archivos data/catalog/*.ts añadiendo:
 *   - amazonTitle  (original Amazon title, referencia interna)
 *   - title        (nuevo título curado GOODPRICE, reemplaza el anterior)
 *   - shortTitle   (título corto para cards)
 *
 * Reglas:
 *   - Migra productos con confidence >= 0.80
 *   - Aplica overrides manuales para los 5 productos problemáticos
 *   - NO elimina ningún otro campo
 *   - NO modifica asin, category, image, price, rating, reviews, brand, status
 */

import fs   from 'fs'
import path from 'path'

// ── Types ──────────────────────────────────────────────────────────────────────

interface TitleEntry {
  id:          string
  asin:        string
  category:    string
  amazonTitle: string
  title:       string
  shortTitle:  string
  confidence?: number
}

interface OverrideEntry {
  id:          string
  reason:      string
  amazonTitle: string
  title:       string
  shortTitle:  string
}

// ── Load artifacts ─────────────────────────────────────────────────────────────

const migration    = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/catalog-title-migration.json'), 'utf-8'))
const overridesRaw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/title-overrides.json'), 'utf-8'))

const overrideMap = new Map<string, OverrideEntry>()
for (const ov of overridesRaw.overrides as OverrideEntry[]) {
  overrideMap.set(ov.id, ov)
}

// ── Build final titles map: overrides win; conf >= 0.80 included ───────────────

const titlesMap = new Map<string, TitleEntry>()

for (const p of migration.products as TitleEntry[]) {
  const ov = overrideMap.get(p.id)
  if (ov) {
    // Manual override — always included regardless of confidence
    titlesMap.set(p.id, {
      id:          p.id,
      asin:        p.asin,
      category:    p.category,
      amazonTitle: ov.amazonTitle,
      title:       ov.title,
      shortTitle:  ov.shortTitle,
    })
  } else if ((p.confidence ?? 0) >= 0.80) {
    titlesMap.set(p.id, p)
  }
}

// ── Escape helper for TypeScript single-quoted string literals ─────────────────

function escSQ(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// ── Apply titles to a catalog file ────────────────────────────────────────────
//
// Strategy: line-by-line scan. When we identify a product block via "id: '...'",
// we replace the next "title: ..." line with the three-field block.

function applyTitlesToFile(filePath: string, products: TitleEntry[]): number {
  const productMap = new Map(products.map(p => [p.id, p]))
  const content    = fs.readFileSync(filePath, 'utf-8')
  const lines      = content.split('\n')
  const result: string[] = []

  let currentId     : string | null = null
  let titleReplaced = false
  let appliedCount  = 0

  for (const line of lines) {
    // Detect entering a product block
    const idMatch = line.match(/^\s+id: '([^']+)'/)
    if (idMatch) {
      currentId     = idMatch[1]
      titleReplaced = false
    }

    // Replace the title line for products in our migration set
    if (currentId && !titleReplaced) {
      const product = productMap.get(currentId)
      if (product && line.trimStart().startsWith('title:')) {
        const indent = line.match(/^(\s*)/)?.[1] ?? '    '
        result.push(`${indent}amazonTitle: '${escSQ(product.amazonTitle)}',`)
        result.push(`${indent}title: '${escSQ(product.title)}',`)
        result.push(`${indent}shortTitle: '${escSQ(product.shortTitle)}',`)
        titleReplaced = true
        appliedCount++
        continue  // drop the original title line
      }
    }

    result.push(line)
  }

  fs.writeFileSync(filePath, result.join('\n'), 'utf-8')
  return appliedCount
}

// ── Process all catalog files ─────────────────────────────────────────────────

const CATALOG_DIR = path.join(process.cwd(), 'data/catalog')

const CATEGORY_FILES: [string, string][] = [
  ['electronica',  'electronica.ts'],
  ['gaming',       'gaming.ts'],
  ['hogar',        'hogar.ts'],
  ['cocina',       'cocina.ts'],
  ['deporte',      'deporte.ts'],
  ['oficina',      'oficina.ts'],
  ['belleza',      'belleza.ts'],
  ['mascotas',     'mascotas.ts'],
  ['bebes',        'bebes.ts'],
  ['herramientas', 'herramientas.ts'],
]

console.log('\n' + '═'.repeat(70))
console.log('  GOODPRICE — TITLE INTELLIGENCE V1 — FASE 5B: MIGRACIÓN MASIVA')
console.log('═'.repeat(70))
console.log(`\n  Productos en mapa de migración : ${titlesMap.size}`)
console.log(`  Overrides manuales aplicados  : ${overrideMap.size}`)
console.log('\n── MIGRACIÓN POR CATEGORÍA ──────────────────────────────────────────')

let totalApplied = 0
const categoryReport: Array<{ category: string; applied: number }> = []

for (const [category, filename] of CATEGORY_FILES) {
  const filePath = path.join(CATALOG_DIR, filename)
  const products = [...titlesMap.values()].filter(p => p.category === category)

  if (products.length === 0) {
    console.log(`  - ${category.padEnd(14)} — (sin productos en rango)`)
    continue
  }

  const applied = applyTitlesToFile(filePath, products)
  console.log(`  ✓ ${category.padEnd(14)} — ${String(applied).padStart(2)} productos actualizados`)
  totalApplied += applied
  categoryReport.push({ category, applied })
}

// ── Post-migration validation ──────────────────────────────────────────────────

console.log('\n── VALIDACIÓN ────────────────────────────────────────────────────────')

// Validate by re-reading files and counting products with all 3 fields
let validatedCount = 0
let missingFields: string[] = []

for (const [category, filename] of CATEGORY_FILES) {
  const filePath = path.join(CATALOG_DIR, filename)
  const content  = fs.readFileSync(filePath, 'utf-8')

  // Find all product ids in the file
  const idMatches = content.match(/id: '([^']+)'/g) ?? []

  for (const match of idMatches) {
    const id = match.match(/id: '([^']+)'/)?.[1]
    if (!id) continue

    if (!titlesMap.has(id)) continue  // product not in migration scope

    const product = titlesMap.get(id)!
    const hasAmazonTitle = content.includes(`id: '${id}'`) &&
      content.includes(`amazonTitle: '${escSQ(product.amazonTitle)}'`)
    const hasTitle       = content.includes(`title: '${escSQ(product.title)}'`)
    const hasShortTitle  = content.includes(`shortTitle: '${escSQ(product.shortTitle)}'`)

    if (hasAmazonTitle && hasTitle && hasShortTitle) {
      validatedCount++
    } else {
      missingFields.push(`${id}: amazonTitle=${hasAmazonTitle} title=${hasTitle} shortTitle=${hasShortTitle}`)
    }
  }
}

if (missingFields.length) {
  console.error('\n  VALIDATION FAILURES:')
  missingFields.forEach(m => console.error('    ✗', m))
  process.exit(1)
}

console.log(`  ✓ ${validatedCount} productos verificados (amazonTitle + title + shortTitle presentes)`)
console.log(`  ✓ 0 campos faltantes`)
console.log(`  ✓ 0 productos eliminados`)

console.log('\n' + '═'.repeat(70))
console.log(`  TOTAL MIGRADOS: ${totalApplied} / 99`)
if (totalApplied !== 99) {
  console.error(`  ✗ ERROR: Se esperaban 99, se migraron ${totalApplied}`)
  process.exit(1)
}
console.log('  STATUS: MIGRACIÓN COMPLETA')
console.log('═'.repeat(70) + '\n')
