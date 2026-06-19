/**
 * scripts/migrate-legacy-to-runtime.ts
 *
 * Migrates all products from the legacy TypeScript catalog
 * (data/catalog/*.ts) into data/catalog/runtime-catalog.json.
 *
 * Run with: npx tsx scripts/migrate-legacy-to-runtime.ts
 *
 * Properties:
 *   Idempotent   — safe to run multiple times; existing ASINs are skipped
 *   Non-destructive — data/catalog/*.ts are never touched
 *   Preserves    — all fields: id, asin, category, title, brand, image,
 *                  price, rating, reviews, status, shipsToColombiaConfirmed,
 *                  lastValidated, isTopSeller, isOffer, badge, oldPrice,
 *                  shortTitle, description
 *
 * After a successful run, runtime-catalog.json has totalProducts > 0, which
 * causes getCatalogSource() to return 'runtime' and all reads to switch over.
 * To rollback: set CATALOG_SOURCE=legacy env var, or call saveRuntimeCatalog()
 * with an empty store (totalProducts = 0).
 */

import { getRawProducts } from '../data/catalog/index'
import {
  readRuntimeCatalog,
  addRuntimeProduct,
  getRuntimeProducts,
} from '../lib/catalog/runtime/index'
import type { RuntimeProduct } from '../lib/catalog/runtime/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function pad(n: number, width = 4): string {
  return String(n).padStart(width, ' ')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('GOODPRICE — migrate-legacy-to-runtime')
  console.log('──────────────────────────────────────────')

  // ── Step 1: read legacy catalog ──────────────────────────────────────────────
  const rawProducts = getRawProducts()
  console.log(`\nLegacy catalog: ${rawProducts.length} raw products`)

  // ── Step 2: read current runtime state ──────────────────────────────────────
  const currentStore = readRuntimeCatalog()
  const existingAsins = new Set(currentStore.products.map(p => p.asin))
  console.log(`Runtime catalog: ${currentStore.totalProducts} products (version ${currentStore.version})`)

  // ── Step 3: migrate ──────────────────────────────────────────────────────────
  const migratedAt = now()
  let added    = 0
  let skipped  = 0
  let errors   = 0

  console.log('\nMigrating products...\n')

  for (const raw of rawProducts) {
    if (!raw.asin) {
      console.warn(`  ✗ skipping product ${raw.id} — missing ASIN`)
      errors++
      continue
    }

    if (existingAsins.has(raw.asin)) {
      skipped++
      continue
    }

    const product: RuntimeProduct = {
      id:                       raw.id,
      asin:                     raw.asin,
      category:                 raw.category,
      title:                    raw.title,
      amazonTitle:              raw.amazonTitle ?? '',
      brand:                    raw.brand       ?? '',
      image:                    raw.image,
      price:                    raw.price,
      rating:                   raw.rating,
      reviews:                  raw.reviews,
      status:                   raw.status ?? 'active',
      shipsToColombiaConfirmed: raw.shipsToColombiaConfirmed ?? false,
      source:                   'legacy',
      admittedAt:               migratedAt,
      lastValidated:            raw.lastValidated ?? null,
      // ── Editorial flags ────────────────────────────────────────────────────
      isTopSeller:  raw.isTopSeller,
      isOffer:      raw.isOffer,
      badge:        raw.badge,
      oldPrice:     raw.oldPrice,
      shortTitle:   raw.shortTitle,
      description:  raw.description,
    }

    addRuntimeProduct(product, 'migration')
    existingAsins.add(raw.asin)
    added++

    if (added % 10 === 0) {
      process.stdout.write(`  Progress: ${pad(added)} added, ${pad(skipped)} skipped, ${pad(errors)} errors\r`)
    }
  }

  // ── Step 4: report ───────────────────────────────────────────────────────────
  const finalStore = readRuntimeCatalog()

  console.log(`\n\n── Migration complete ──────────────────────────────`)
  console.log(`  Added:   ${added}`)
  console.log(`  Skipped: ${skipped} (already existed)`)
  console.log(`  Errors:  ${errors}`)
  console.log(`  Total in runtime catalog: ${finalStore.totalProducts}`)
  console.log(`  Runtime catalog version:  ${finalStore.version}`)
  console.log(`  Updated at:               ${finalStore.updatedAt}`)

  // ── Step 5: per-category breakdown ──────────────────────────────────────────
  const runtimeProducts = getRuntimeProducts()
  const byCategory: Record<string, number> = {}
  for (const p of runtimeProducts) {
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1
  }

  console.log('\n── By category ─────────────────────────────────────')
  const legacyByCategory: Record<string, number> = {}
  for (const p of rawProducts) {
    legacyByCategory[p.category] = (legacyByCategory[p.category] ?? 0) + 1
  }

  const categories = [...new Set([...Object.keys(legacyByCategory), ...Object.keys(byCategory)])]
  for (const cat of categories.sort()) {
    const legCount = legacyByCategory[cat] ?? 0
    const rtCount  = byCategory[cat]       ?? 0
    const match    = legCount === rtCount ? '✓' : '✗'
    console.log(`  ${match} ${cat.padEnd(16)} legacy: ${pad(legCount, 3)}  runtime: ${pad(rtCount, 3)}`)
  }

  // ── Step 6: status breakdown ─────────────────────────────────────────────────
  const statusCounts: Record<string, number> = {}
  for (const p of runtimeProducts) {
    statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1
  }

  console.log('\n── By status ───────────────────────────────────────')
  for (const [status, count] of Object.entries(statusCounts).sort()) {
    console.log(`  ${status.padEnd(12)} ${count}`)
  }

  if (errors > 0) {
    console.error('\n❌ Migration completed with errors — review output above.')
    process.exit(1)
  } else {
    console.log('\n✅ Migration successful.')
    console.log('   Runtime catalog is now active (getCatalogSource() will return "runtime").')
    console.log('   Rollback: set CATALOG_SOURCE=legacy in environment variables.')
  }
}

main().catch(err => {
  console.error('Fatal error during migration:', err)
  process.exit(1)
})
