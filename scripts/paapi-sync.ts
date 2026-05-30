#!/usr/bin/env npx tsx --tsconfig tsconfig.json
/**
 * PA-API Image Sync — CLI runner
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/paapi-sync.ts
 *   npx tsx --tsconfig tsconfig.json scripts/paapi-sync.ts --dry-run
 *   npx tsx --tsconfig tsconfig.json scripts/paapi-sync.ts --force
 *   npx tsx --tsconfig tsconfig.json scripts/paapi-sync.ts --id=dep-001 --id=elec-002
 *   npx tsx --tsconfig tsconfig.json scripts/paapi-sync.ts --check   (just count stale images)
 *
 * Environment:
 *   Reads PAAPI_ACCESS_KEY, PAAPI_SECRET_KEY from .env.local automatically via tsx.
 *   Or set them inline:
 *     PAAPI_ACCESS_KEY=xxx PAAPI_SECRET_KEY=yyy npx tsx ...
 *
 * Output:
 *   Colored progress per product + final summary table.
 *   Log written to data/paapi/sync-log.json
 */

// Load .env.local for local development
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const envPath = join(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

import { getPaapiClient } from '@/lib/paapi/client'
import { syncImages, countStaleImages, isImageFresh } from '@/lib/paapi/image-sync'
import { getCacheStats } from '@/lib/paapi/cache'
import { getRawProducts } from '@/data/catalog'

// ── ANSI helpers ───────────────────────────────────────────────────────────────

const R = '\x1b[0m'
const B = (s: string) => `\x1b[1m${s}${R}`
const G = (s: string) => `\x1b[32m${s}${R}`
const Y = (s: string) => `\x1b[33m${s}${R}`
const Rd = (s: string) => `\x1b[31m${s}${R}`
const Cy = (s: string) => `\x1b[36m${s}${R}`
const Gr = (s: string) => `\x1b[90m${s}${R}`
const line = (ch = '─', n = 70) => ch.repeat(n)

// ── CLI args ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const dryRun       = args.includes('--dry-run')
const forceRefresh = args.includes('--force')
const checkOnly    = args.includes('--check')
const productIds   = args.filter(a => a.startsWith('--id=')).map(a => a.replace('--id=', ''))

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log()
  console.log(B(line('━')))
  console.log(B('  GOODPRICE — PA-API Image Sync'))
  console.log(B(line('━')))
  console.log()

  // ── Pre-flight check ──────────────────────────────────────────────────────

  const client = getPaapiClient()
  if (!client.isConfigured) {
    console.log(Rd('  ✗ PA-API credentials not configured.'))
    console.log()
    console.log('  Set these in .env.local:')
    console.log(Cy('    PAAPI_ACCESS_KEY=<your-access-key>'))
    console.log(Cy('    PAAPI_SECRET_KEY=<your-secret-key>'))
    console.log(Cy('    PAAPI_PARTNER_TAG=pulseprice-20'))
    console.log()
    console.log('  Get credentials at:')
    console.log(Gr('    https://affiliate-program.amazon.com/assoc_credentials/home'))
    console.log()
    process.exit(1)
  }

  // ── Image health summary ──────────────────────────────────────────────────

  const { stale, fresh, total } = countStaleImages()
  const cache = getCacheStats()

  console.log('  Catálogo')
  console.log(`  Total productos     : ${B(String(total))}`)
  console.log(`  Imágenes frescas    : ${G(String(fresh))}`)
  console.log(`  Imágenes stale      : ${Rd(String(stale))}`)
  console.log()
  console.log('  Cache PA-API local')
  console.log(`  Entradas totales    : ${cache.total}`)
  console.log(`  Válidas             : ${G(String(cache.valid))}`)
  console.log(`  Expiradas           : ${Y(String(cache.expired))}`)
  console.log(`  Errores             : ${Rd(String(cache.errors))}`)
  if (cache.newestFetchedAt) {
    console.log(`  Última fetch        : ${Gr(cache.newestFetchedAt)}`)
  }
  console.log()

  if (checkOnly) {
    const products = getRawProducts()
    const broken = products.filter(p => !isImageFresh(p.image))
    if (broken.length > 0) {
      console.log(B(`  Productos con imagen stale (${broken.length}):`))
      console.log(Gr(`  ${'ID'.padEnd(12)} ${'ASIN'.padEnd(12)} ${'Categoría'.padEnd(14)} Imagen`))
      console.log(Gr(`  ${line('─', 66)}`))
      for (const p of broken) {
        const imgShort = p.image.length > 35 ? '...' + p.image.slice(-32) : p.image
        console.log(`  ${p.id.padEnd(12)} ${p.asin.padEnd(12)} ${p.category.padEnd(14)} ${Gr(imgShort)}`)
      }
      console.log()
    }
    process.exit(0)
  }

  if (stale === 0 && !forceRefresh) {
    console.log(G('  ✓ Todas las imágenes están frescas. No hay nada que sincronizar.'))
    console.log(Gr('  Usa --force para re-sincronizar igualmente.'))
    console.log()
    process.exit(0)
  }

  // ── Sync options display ──────────────────────────────────────────────────

  const targetDesc = productIds.length
    ? `${productIds.length} producto(s) específico(s)`
    : forceRefresh ? `todos los ${total} productos` : `${stale} con imagen stale`

  console.log(`  Modo              : ${dryRun ? Y('DRY RUN (no escribe archivos)') : G('REAL')}`)
  console.log(`  Cache             : ${forceRefresh ? Y('ignorar (--force)') : G('usar si disponible')}`)
  console.log(`  Targets           : ${B(targetDesc)}`)
  console.log(`  Partner tag       : ${Cy(process.env.PAAPI_PARTNER_TAG ?? 'pulseprice-20')}`)
  console.log()

  if (!dryRun) {
    console.log(Y('  → Los archivos de catálogo serán modificados en disco.'))
    console.log(Y('  → Reinicia el servidor después para que Next.js recargue los módulos.'))
    console.log()
  }

  console.log(B(line('─')))
  console.log()

  // ── Execute sync ──────────────────────────────────────────────────────────

  const log = await syncImages({
    productIds: productIds.length ? productIds : undefined,
    forceRefresh,
    dryRun,
    onProgress: (done, total, result) => {
      const icon =
        result.status === 'updated'   ? G('✓') :
        result.status === 'from_cache' ? Cy('◇') :
        result.status === 'unchanged' ? Gr('=') :
        result.status === 'no_image'  ? Y('⚠') :
        Rd('✗')

      const statusStr =
        result.status === 'updated'    ? G('actualizado') :
        result.status === 'from_cache' ? Cy('desde cache') :
        result.status === 'unchanged'  ? Gr('sin cambio')  :
        result.status === 'no_image'   ? Y('sin imagen')   :
        Rd('error: ' + (result.error?.slice(0, 60) ?? ''))

      const counter = `[${String(done).padStart(3)}/${String(total).padStart(3)}]`
      console.log(`  ${Gr(counter)} ${icon} ${result.productId.padEnd(12)} ${Gr(result.asin)} → ${statusStr}`)
    },
  })

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log()
  console.log(B(line('━')))
  console.log(B('  RESUMEN'))
  console.log(B(line('━')))
  console.log()
  console.log(`  Targets procesados  : ${B(String(log.totalTargets))}`)
  console.log(`  ✓ Actualizados       : ${G(String(log.updated))}`)
  console.log(`  ◇ Desde cache        : ${Cy(String(log.fromCache))}`)
  console.log(`  = Sin cambio         : ${Gr(String(log.unchanged))}`)
  console.log(`  ⚠ Sin imagen         : ${Y(String(log.noImage))}`)
  console.log(`  ✗ Errores            : ${Rd(String(log.errors))}`)
  console.log(`  ⏱ Duración           : ${Math.round(log.durationMs / 1000)}s`)
  console.log()

  if (log.updated > 0 && !dryRun) {
    console.log(G(`  ✓ ${log.updated} imagen(s) actualizada(s) en los archivos de catálogo.`))
    console.log()
    console.log(Y('  → Reinicia el servidor Next.js para que se reflejen los cambios:'))
    console.log(Cy('     npm run dev'))
    console.log()
  }

  if (log.errors > 0) {
    const errored = log.results.filter(r => r.status === 'api_error')
    console.log(Rd(`  ✗ ${log.errors} ASIN(s) fallaron:`))
    for (const r of errored.slice(0, 5)) {
      console.log(Gr(`    ${r.productId} (${r.asin}): ${r.error?.slice(0, 80) ?? 'desconocido'}`))
    }
    if (errored.length > 5) console.log(Gr(`    ... y ${errored.length - 5} más`))
    console.log()
  }

  if (!dryRun) {
    console.log(Gr(`  Log guardado en: data/paapi/sync-log.json`))
    console.log()
  }
}

main().catch(err => {
  console.error(Rd('\n  Error fatal:'), err)
  process.exit(1)
})
