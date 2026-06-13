/**
 * scripts/amazon-poc.ts
 *
 * Extended Playwright PoC — 10 ASINs across all GOODPRICE categories.
 * Measures stability: extraction rate, CAPTCHAs, blocks, field coverage, timing.
 *
 * Usage:
 *   npx tsx scripts/amazon-poc.ts
 *
 * Does NOT write to the catalog or any file.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductResult {
  asin:        string
  category:    string
  title:       string | null
  price:       string | null
  rating:      string | null
  reviewCount: string | null
  imageUrl:    string | null
  elapsed:     number         // seconds
  status:      'ok' | 'partial' | 'blocked' | 'error'
  blockReason: string | null
  errorMsg:    string | null
  fieldsFound: number         // 0–5
}

// ── Sample — 1 ASIN per catalog category ──────────────────────────────────────

const SAMPLE: { asin: string; category: string }[] = [
  { asin: 'B0B61XH5YT', category: 'belleza'      },
  { asin: 'B06Y1YD5W7', category: 'cocina'       },
  { asin: 'B09WTP57Z5', category: 'deporte'      },
  { asin: 'B0CHWRXH8B', category: 'electronica'  },
  { asin: 'B0CQKLS4RP', category: 'gaming'       },
  { asin: 'B01N5AIZIM', category: 'herramientas' },
  { asin: 'B07R295MLS', category: 'hogar'        },
  { asin: 'B07MZMLZZ3', category: 'mascotas'     },
  { asin: 'B09HM94VDS', category: 'oficina'      },
  { asin: 'B0979SDKG8', category: 'bebes'        },
]

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL   = 'https://www.amazon.com/dp'
const TIMEOUT    = 30_000
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36'

// Delay range between requests (ms) — mimics human browsing
const DELAY_MIN = 3_500
const DELAY_MAX = 7_000

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function randomDelay(): number {
  return DELAY_MIN + Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN))
}

async function getText(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first()
      const visible = await el.isVisible({ timeout: 2_000 }).catch(() => false)
      if (visible) {
        const text = (await el.textContent())?.trim() ?? null
        if (text) return text
      }
    } catch { /* try next */ }
  }
  return null
}

async function getAttr(
  page: Page,
  selectors: string[],
  attr: string,
): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first()
      const visible = await el.isVisible({ timeout: 2_000 }).catch(() => false)
      if (visible) {
        const val = await el.getAttribute(attr)
        if (val?.trim()) return val.trim()
      }
    } catch { /* try next */ }
  }
  return null
}

function detectBlocked(title: string, url: string, body: string): string | null {
  const t = title.toLowerCase()
  const u = url.toLowerCase()
  const b = body.toLowerCase()
  if (u.includes('captcha') || b.includes('enter the characters you see below'))
    return 'captcha'
  if (t.includes('robot check') || b.includes('to discuss automated access to amazon'))
    return 'robot-check'
  if (t.includes('page not found') || b.includes('dogs of amazon'))
    return 'page-not-found'
  if (t.includes("sorry! we couldn") || t.includes('503') || t.includes('service unavailable'))
    return 'service-error'
  return null
}

function countFields(r: Omit<ProductResult, 'fieldsFound' | 'status' | 'elapsed' | 'blockReason' | 'errorMsg'>): number {
  return [r.title, r.price, r.rating, r.reviewCount, r.imageUrl].filter(Boolean).length
}

function pad(s: string | null | number, len: number, right = false): string {
  const str = String(s ?? '—')
  const truncated = str.length > len ? str.slice(0, len - 1) + '…' : str
  return right
    ? truncated.padStart(len)
    : truncated.padEnd(len)
}

// ── Per-product scrape ────────────────────────────────────────────────────────

async function scrapeOne(
  page: Page,
  asin: string,
  category: string,
): Promise<ProductResult> {
  const url = `${BASE_URL}/${asin}`
  const t0  = Date.now()

  const base = { asin, category, title: null, price: null,
                 rating: null, reviewCount: null, imageUrl: null }

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    const httpStatus = response?.status() ?? 0

    await sleep(1_500) // let JS settle

    const pageTitle  = await page.title()
    const currentUrl = page.url()
    const bodyText   = (await page.locator('body').textContent()) ?? ''

    const blocked = detectBlocked(pageTitle, currentUrl, bodyText)
    if (blocked) {
      return {
        ...base,
        elapsed:     (Date.now() - t0) / 1000,
        status:      'blocked',
        blockReason: blocked,
        errorMsg:    null,
        fieldsFound: 0,
      }
    }

    if (httpStatus >= 400) {
      return {
        ...base,
        elapsed:     (Date.now() - t0) / 1000,
        status:      'error',
        blockReason: null,
        errorMsg:    `HTTP ${httpStatus}`,
        fieldsFound: 0,
      }
    }

    // ── Extract ─────────────────────────────────────────────────────────────

    const title = await getText(page, [
      '#productTitle',
      'span#productTitle',
      'h1.a-size-large',
    ])

    const priceRaw = await getText(page, [
      '.priceToPay .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      '.a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#price_inside_buybox',
      'span[data-a-color="price"] .a-offscreen',
    ])
    const price = priceRaw
      ? priceRaw.split('\n')[0].trim().replace(/(\$[\d,.]+)\1/, '$1')
      : null

    const ratingRaw = await getText(page, [
      '#acrPopover .a-icon-alt',
      'span[data-hook="rating-out-of-text"]',
      'i[data-hook="average-star-rating"] .a-icon-alt',
    ])
    const rating = ratingRaw ? (ratingRaw.match(/[\d.]+/)?.[0] ?? ratingRaw) : null

    const reviewCountRaw = await getText(page, [
      '#acrCustomerReviewText',
      'span[data-hook="total-review-count"]',
    ])
    const reviewCount = reviewCountRaw
      ? reviewCountRaw.replace(/[^0-9]/g, '') || reviewCountRaw
      : null

    const imageUrl = await getAttr(page, [
      '#landingImage',
      '#imgTagWrapperId img',
      '#main-image-container img',
    ], 'src')

    const fields = countFields({ asin, category, title, price, rating, reviewCount, imageUrl })
    const elapsed = (Date.now() - t0) / 1000

    return {
      asin, category, title, price, rating, reviewCount, imageUrl,
      elapsed,
      status:      fields === 5 ? 'ok' : fields > 0 ? 'partial' : 'error',
      blockReason: null,
      errorMsg:    null,
      fieldsFound: fields,
    }

  } catch (err) {
    return {
      ...base,
      elapsed:     (Date.now() - t0) / 1000,
      status:      'error',
      blockReason: null,
      errorMsg:    err instanceof Error ? err.message.split('\n')[0] : String(err),
      fieldsFound: 0,
    }
  }
}

// ── Summary table ─────────────────────────────────────────────────────────────

function printTable(results: ProductResult[]): void {
  const STATUS_ICON: Record<string, string> = {
    ok:      '✅',
    partial: '⚠️ ',
    blocked: '⛔',
    error:   '❌',
  }

  console.log('\n')
  console.log('┌─────────────┬──────────────┬────────────────────────────────────────┬───────┬───────┬─────────┐')
  console.log('│ ASIN        │ Categoría    │ Título (truncado)                       │ Precio│ Camp. │  Tiempo │')
  console.log('├─────────────┼──────────────┼────────────────────────────────────────┼───────┼───────┼─────────┤')

  for (const r of results) {
    const icon    = STATUS_ICON[r.status] ?? '?'
    const title   = r.blockReason ? `[${r.blockReason}]` : (r.errorMsg ?? r.title ?? '—')
    const price   = r.price ?? '—'
    const fields  = r.status === 'ok' || r.status === 'partial'
                    ? `${icon} ${r.fieldsFound}/5`
                    : `${icon} 0/5`
    const elapsed = `${r.elapsed.toFixed(1)}s`

    console.log(
      `│ ${pad(r.asin, 11)} │ ${pad(r.category, 12)} │ ${pad(title, 38)} │ ${pad(price, 5)} │ ${pad(fields, 5)} │ ${pad(elapsed, 7, true)} │`
    )
  }

  console.log('└─────────────┴──────────────┴────────────────────────────────────────┴───────┴───────┴─────────┘')

  // ── Aggregate stats ──────────────────────────────────────────────────────
  const total      = results.length
  const ok         = results.filter(r => r.status === 'ok').length
  const partial    = results.filter(r => r.status === 'partial').length
  const blocked    = results.filter(r => r.status === 'blocked').length
  const errors     = results.filter(r => r.status === 'error').length
  const totalSecs  = results.reduce((s, r) => s + r.elapsed, 0)
  const avgSecs    = totalSecs / total
  const captchas   = results.filter(r => r.blockReason === 'captcha' || r.blockReason === 'robot-check').length

  const allFields  = [0, 1, 2, 3, 4].map(i => {
    const NAMES = ['title', 'price', 'rating', 'reviewCount', 'imageUrl'] as const
    const key   = NAMES[i]
    const found = results.filter(r => r[key] !== null).length
    return `${key}: ${found}/${total}`
  })

  console.log('\n── Resumen agregado ──────────────────────────────────────────────────')
  console.log(`  Productos probados : ${total}`)
  console.log(`  Completos (5/5)    : ${ok}`)
  console.log(`  Parciales          : ${partial}`)
  console.log(`  Bloqueados         : ${blocked}  (CAPTCHAs: ${captchas})`)
  console.log(`  Errores            : ${errors}`)
  console.log(`  Tiempo total       : ${totalSecs.toFixed(1)}s`)
  console.log(`  Tiempo promedio    : ${avgSecs.toFixed(1)}s / producto`)
  console.log(`  Extrapolación 200p : ~${(avgSecs * 200 / 60).toFixed(0)} min secuencial`)
  console.log(`\n  Cobertura por campo:`)
  allFields.forEach(f => console.log(`    ${f}`))
}

// ── Main ──────────────────────────────────────────────────────────────────────

;(async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(' Amazon Playwright PoC — 10 ASINs × 10 categorías')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Delay entre requests: ${DELAY_MIN/1000}–${DELAY_MAX/1000}s (aleatorio)\n`)

  const browser: Browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1366,768',
    ],
  })

  // Single context for the full run (persists cookies/session)
  const context: BrowserContext = await browser.newContext({
    userAgent: USER_AGENT,
    viewport:  { width: 1366, height: 768 },
    locale:    'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const page = await context.newPage()
  const results: ProductResult[] = []
  const totalStart = Date.now()

  for (let i = 0; i < SAMPLE.length; i++) {
    const { asin, category } = SAMPLE[i]
    const n = i + 1

    process.stdout.write(`[${n}/${SAMPLE.length}] ${category.padEnd(13)} ${asin}  `)

    const result = await scrapeOne(page, asin, category)
    results.push(result)

    const icon = result.status === 'ok'      ? '✅' :
                 result.status === 'partial'  ? '⚠️' :
                 result.status === 'blocked'  ? '⛔' : '❌'

    console.log(
      `${icon}  ${result.fieldsFound}/5 fields  ${result.elapsed.toFixed(1)}s` +
      (result.blockReason ? `  [${result.blockReason}]` : '') +
      (result.errorMsg    ? `  [${result.errorMsg.slice(0, 60)}]` : '')
    )

    // Delay before next request (skip after last)
    if (i < SAMPLE.length - 1) {
      const delay = randomDelay()
      process.stdout.write(`    ↳ delay ${(delay / 1000).toFixed(1)}s…\n`)
      await sleep(delay)
    }
  }

  await browser.close()

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1)
  console.log(`\nTiempo total de ejecución: ${totalElapsed}s`)

  printTable(results)

  // Detailed data dump
  console.log('\n── Datos extraídos ───────────────────────────────────────────────────')
  for (const r of results) {
    if (r.status === 'ok' || r.status === 'partial') {
      console.log(`\n  ${r.category} / ${r.asin}`)
      console.log(`    title       : ${r.title?.slice(0, 80) ?? '—'}`)
      console.log(`    price       : ${r.price ?? '—'}`)
      console.log(`    rating      : ${r.rating ?? '—'}`)
      console.log(`    reviewCount : ${r.reviewCount ?? '—'}`)
      console.log(`    imageUrl    : ${r.imageUrl?.slice(0, 70) ?? '—'}`)
    }
  }
})()
