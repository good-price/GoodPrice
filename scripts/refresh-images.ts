/**
 * GOODPRICE Image Refresher — standalone script
 * Run with: npx tsx scripts/refresh-images.ts
 *
 * Fetches fresh image URLs for all products with broken images (HTTP 404).
 * Reads the latest audit report to identify targets, then:
 *  1. Fetches each Amazon product page
 *  2. Extracts the first hiRes image URL (m.media-amazon.com domain)
 *  3. Patches the catalog TypeScript file
 *
 * Rate limiting: 6s delay between requests (avoids Amazon bot detection)
 * For 193 products: ~20 minutes total
 *
 * Progress file: data/audit/refresh-progress.json
 * Resume-safe: re-running the script skips already-updated products.
 */

import fs   from 'fs'
import path from 'path'
import { getRawProducts } from '@/data/catalog'
import { loadLatestReport } from '@/lib/audit/report'

// ── Config ────────────────────────────────────────────────────────────────────

const DELAY_MS        = 6_000  // between requests (6s to avoid rate limiting)
const FETCH_TIMEOUT   = 12_000 // 12s per page
const MAX_RETRIES     = 2
const PROGRESS_FILE   = path.join(process.cwd(), 'data', 'audit', 'refresh-progress.json')
const CATALOG_DIR     = path.join(process.cwd(), 'data', 'catalog')

// ── Color helpers ─────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m'
const RED    = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN   = '\x1b[36m'
const GRAY   = '\x1b[90m'
const BOLD   = '\x1b[1m'
const RESET  = '\x1b[0m'

const g = (t: string | number) => `${GREEN}${t}${RESET}`
const r = (t: string | number) => `${RED}${t}${RESET}`
const y = (t: string | number) => `${YELLOW}${t}${RESET}`
const c = (t: string | number) => `${CYAN}${t}${RESET}`
const gr = (t: string | number) => `${GRAY}${t}${RESET}`
const b = (t: string | number) => `${BOLD}${t}${RESET}`

// ── Progress persistence ──────────────────────────────────────────────────────

interface Progress {
  startedAt:   string
  updatedAt:   string
  done:        Record<string, { asin: string; oldUrl: string; newUrl: string; updatedAt: string }>
  failed:      Record<string, { asin: string; reason: string; attempts: number }>
}

function loadProgress(): Progress {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'))
  } catch {
    return { startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), done: {}, failed: {} }
  }
}

function saveProgress(p: Progress): void {
  p.updatedAt = new Date().toISOString()
  const dir = path.dirname(PROGRESS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2), 'utf-8')
}

// ── Amazon page scraper ───────────────────────────────────────────────────────

const AMAZON_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control':   'no-cache',
}

async function fetchFreshImageUrl(asin: string): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`https://www.amazon.com/dp/${asin}`, {
        headers: AMAZON_HEADERS,
        signal:  AbortSignal.timeout(FETCH_TIMEOUT),
        redirect: 'follow',
      })

      if (!res.ok) {
        if (attempt === MAX_RETRIES) return null
        await delay(3_000)
        continue
      }

      const html = await res.text()

      // Primary: extract from "hiRes" JSON field (most reliable — embedded product data)
      const hiResMatch = html.match(/"hiRes"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/)
      if (hiResMatch) return hiResMatch[1]

      // Fallback 1: "large" field
      const largeMatch = html.match(/"large"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/)
      if (largeMatch) return largeMatch[1]

      // Fallback 2: images-na domain (old CDN, but might still work for some)
      const oldCdnMatch = html.match(/"hiRes"\s*:\s*"(https:\/\/images-na\.ssl-images-amazon\.com\/images\/I\/[^"]+)"/)
      if (oldCdnMatch) return oldCdnMatch[1]

      // Fallback 3: landingAssetUrl
      const landingMatch = html.match(/landingAssetUrl\s*"\s*:\s*"(https:\/\/[^"]+\.jpg)"/)
      if (landingMatch) return landingMatch[1]

      return null
    } catch (err) {
      if (attempt === MAX_RETRIES) return null
      await delay(3_000 * attempt)
    }
  }
  return null
}

async function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── Catalog file patcher ──────────────────────────────────────────────────────

/** Find which catalog .ts file contains the given ASIN and patch the image URL */
function patchCatalogImage(asin: string, oldUrl: string, newUrl: string): boolean {
  const catalogFiles = fs.readdirSync(CATALOG_DIR).filter(f => f.endsWith('.ts') && f !== 'index.ts')

  for (const filename of catalogFiles) {
    const filepath = path.join(CATALOG_DIR, filename)
    const content  = fs.readFileSync(filepath, 'utf-8')

    if (!content.includes(asin)) continue

    // Safety: verify the old URL is in this file
    if (!content.includes(oldUrl)) {
      // URL might have already been updated — check if ASIN is followed by any image
      if (content.includes(asin)) {
        // File contains ASIN but different image URL — probably already updated
        return true
      }
      continue
    }

    const updated = content.replace(oldUrl, newUrl)
    if (updated === content) continue

    // Also update lastValidated to today
    const today = new Date().toISOString().split('T')[0]
    // Find and update the lastValidated for this specific product
    // Strategy: after replacing the image URL, also update the lastValidated field
    // that appears between the ASIN and the next id: field
    const asinIndex = updated.indexOf(`asin: '${asin}'`)
    if (asinIndex !== -1) {
      const nextProductIndex = updated.indexOf('\n  {', asinIndex + 1)
      const productBlock = updated.slice(asinIndex, nextProductIndex !== -1 ? nextProductIndex : undefined)
      const updatedBlock = productBlock.replace(
        /lastValidated:\s*'[^']*'/,
        `lastValidated: '${today}'`
      )
      const finalContent = updated.slice(0, asinIndex) + updatedBlock + (nextProductIndex !== -1 ? updated.slice(nextProductIndex) : '')
      fs.writeFileSync(filepath, finalContent, 'utf-8')
    } else {
      fs.writeFileSync(filepath, updated, 'utf-8')
    }

    return true
  }

  return false
}

// ── Verify new URL actually works ─────────────────────────────────────────────

async function verifyImageUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method:  'HEAD',
      signal:  AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoodpriceImageCheck/1.0)' },
      redirect: 'follow',
    })
    return res.ok
  } catch {
    return false
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log()
  console.log(b('━'.repeat(70)))
  console.log(b('  GOODPRICE Image Refresher'))
  console.log(b('━'.repeat(70)))
  console.log()

  // Load audit report to find broken images
  const report = loadLatestReport()
  if (!report) {
    console.error(r('❌ No audit report found. Run: npx tsx scripts/audit-runner.ts first.'))
    process.exit(1)
  }

  const brokenProducts = report.products.filter(p => !p.imageCheck.accessible && p.asinCheck.reachable === true)
  console.log(`  Productos con imagen rota   : ${b(r(brokenProducts.length))}`)
  console.log(`  Todos con ASIN confirmado   : ${g('✓')}`)
  console.log(`  Delay entre requests        : ${DELAY_MS / 1000}s`)
  console.log(`  Tiempo estimado             : ${b(Math.ceil(brokenProducts.length * DELAY_MS / 60000) + ' min')}`)
  console.log()

  // Load or init progress
  const progress = loadProgress()
  const alreadyDone   = Object.keys(progress.done).length
  const alreadyFailed = Object.keys(progress.failed).length

  if (alreadyDone > 0 || alreadyFailed > 0) {
    console.log(`  Progreso previo cargado: ${g(alreadyDone + ' actualizados')}, ${y(alreadyFailed + ' fallidos')}`)
    console.log()
  }

  // Build work queue — skip already done or definitively failed (3 attempts)
  const queue = brokenProducts.filter(p => {
    if (p.productId in progress.done) return false
    const fail = progress.failed[p.productId]
    if (fail && fail.attempts >= MAX_RETRIES) return false
    return true
  })

  if (queue.length === 0) {
    console.log(g('✅ Todos los productos ya han sido procesados. Revisa refresh-progress.json'))
    return
  }

  console.log(`  En cola para procesar: ${b(queue.length)}`)
  console.log()
  console.log(b('  Iniciando...'))
  console.log(gr('─'.repeat(70)))
  console.log()

  let updated = 0
  let failed  = 0
  let skipped = 0

  for (let i = 0; i < queue.length; i++) {
    const product = queue[i]
    const prefix = `  [${String(i + 1).padStart(3)}/${queue.length}] ${product.asin} ${gr(product.category)}`

    process.stdout.write(`${prefix} → scraping...`)

    const newUrl = await fetchFreshImageUrl(product.asin)

    if (!newUrl) {
      console.log(`\r${prefix} → ${r('❌ sin URL')}`)
      progress.failed[product.productId] = {
        asin:     product.asin,
        reason:   'No hiRes URL found in page',
        attempts: (progress.failed[product.productId]?.attempts ?? 0) + 1,
      }
      failed++
      saveProgress(progress)
      await delay(DELAY_MS)
      continue
    }

    // Verify the new URL actually works
    const works = await verifyImageUrl(newUrl)
    if (!works) {
      console.log(`\r${prefix} → ${y('⚠ URL extraída no responde (200)')} ${gr(newUrl.slice(0, 50))}`)
      progress.failed[product.productId] = {
        asin:     product.asin,
        reason:   `Extracted URL returned non-200: ${newUrl}`,
        attempts: (progress.failed[product.productId]?.attempts ?? 0) + 1,
      }
      failed++
      saveProgress(progress)
      await delay(DELAY_MS)
      continue
    }

    // Patch the catalog file
    const patched = patchCatalogImage(product.asin, product.imageCheck.imageUrl, newUrl)
    if (!patched) {
      console.log(`\r${prefix} → ${y('⚠ archivo no parchado (URL no encontrada en catálogo)')}`)
      skipped++
    } else {
      console.log(`\r${prefix} → ${g('✓')} ${c(newUrl.slice(newUrl.lastIndexOf('/') + 1, newUrl.lastIndexOf('.')).slice(0, 25))}`)
      progress.done[product.productId] = {
        asin:      product.asin,
        oldUrl:    product.imageCheck.imageUrl,
        newUrl,
        updatedAt: new Date().toISOString(),
      }
      updated++
    }

    saveProgress(progress)

    if (i < queue.length - 1) {
      await delay(DELAY_MS)
    }
  }

  // Summary
  console.log()
  console.log(b('━'.repeat(70)))
  console.log(b('  RESUMEN'))
  console.log(b('━'.repeat(70)))
  console.log()
  console.log(`  ✅ Actualizados : ${g(updated)}`)
  console.log(`  ⚠  Fallidos    : ${failed > 0 ? y(failed) : gr(0)}`)
  console.log(`  ⊘  Saltados    : ${skipped > 0 ? gr(skipped) : gr(0)}`)
  console.log()
  console.log(`  Progreso guardado en: ${c(PROGRESS_FILE)}`)
  console.log()

  if (updated > 0) {
    console.log(`  ${g('→')} Ejecuta el audit nuevamente para confirmar el fix:`)
    console.log(`     ${gr('npx tsx scripts/audit-runner.ts')}`)
    console.log()
  }

  if (failed > 0) {
    console.log(`  ${y('→')} Productos fallidos (${failed}): algunos podrían ser listados regionales.`)
    console.log(`     Revisa ${c('data/audit/refresh-progress.json')} para detalles.`)
    console.log()
  }
}

main().catch(err => {
  console.error(r('\n❌ Error fatal:'), err)
  process.exit(1)
})
