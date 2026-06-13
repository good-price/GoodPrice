/**
 * scripts/colombia-audit.ts
 *
 * Audits all 56 gold products from the perspective of a Colombian buyer.
 * Checks: page health, price, cart/buy buttons, Colombia shipping, featured offer.
 * Classifies A (buyable) / B (restricted) / C (active but not buyable) / D (dead).
 *
 * Saves progress incrementally to data/colombia-audit.json.
 * Usage: npx tsx scripts/colombia-audit.ts
 * Read-only — does NOT modify the catalog.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

// ── Types ──────────────────────────────────────────────────────────────────────

type Grade = 'A' | 'B' | 'C' | 'D'

interface AuditResult {
  id:              string
  asin:            string
  category:        string
  title:           string
  url:             string
  pageAlive:       boolean
  blockReason:     string | null
  priceVisible:    boolean
  priceRaw:        string | null
  mainImageOk:     boolean
  addToCart:       boolean
  buyNow:          boolean
  featuredOffer:   boolean
  shipsToColombiaText: string | null
  shipsToColombiaConfirmed: boolean | null
  currentlyUnavailable: boolean
  grade:           Grade
  gradeReason:     string
  elapsed:         number
}

interface GoldProduct {
  id: string; asin: string; category: string; title: string
}

// ── Config ─────────────────────────────────────────────────────────────────────

const BASE_URL   = 'https://www.amazon.com/dp'
const TIMEOUT    = 35_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const DELAY_MIN  = 4_000
const DELAY_MAX  = 8_000
const REPORT_PATH = path.join(__dirname, '../data/colombia-audit.json')

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
function randomDelay() { return DELAY_MIN + Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN)) }

async function isVisible(page: Page, selector: string, timeout = 3_000): Promise<boolean> {
  try {
    const el = page.locator(selector).first()
    return await el.isVisible({ timeout })
  } catch { return false }
}

async function getText(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first()
      const visible = await el.isVisible({ timeout: 2_500 }).catch(() => false)
      if (visible) {
        const text = (await el.textContent())?.trim() ?? null
        if (text) return text
      }
    } catch { /* next */ }
  }
  return null
}

function detectBlock(title: string, url: string, body: string): string | null {
  const t = title.toLowerCase(), u = url.toLowerCase(), b = body.toLowerCase()
  if (u.includes('captcha') || b.includes('enter the characters you see below')) return 'captcha'
  if (t.includes('robot check') || b.includes('to discuss automated access to amazon')) return 'robot-check'
  if (t.includes('page not found') || b.includes('dogs of amazon') || b.includes("we can't find that page")) return 'page-not-found'
  if (t.includes("sorry! we couldn") || t.includes('503') || t.includes('service unavailable')) return 'service-error'
  return null
}

function grade(r: Omit<AuditResult, 'grade' | 'gradeReason'>): { grade: Grade; reason: string } {
  if (!r.pageAlive || r.blockReason === 'page-not-found') {
    return { grade: 'D', reason: 'Página muerta o 404' }
  }
  if (r.blockReason === 'captcha' || r.blockReason === 'robot-check') {
    return { grade: 'D', reason: `Bloqueado: ${r.blockReason}` }
  }
  if (!r.priceVisible) {
    return { grade: 'C', reason: 'Página activa pero sin precio visible' }
  }
  if (!r.featuredOffer || r.currentlyUnavailable) {
    return { grade: 'C', reason: 'Sin oferta destacada o actualmente no disponible' }
  }
  if (r.shipsToColombiaConfirmed === false) {
    return { grade: 'B', reason: 'Disponible pero sin envío confirmado a Colombia' }
  }
  if (r.addToCart || r.buyNow) {
    if (r.shipsToColombiaConfirmed === true) {
      return { grade: 'A', reason: 'Comprable desde Colombia' }
    }
    // Has price, offer, cart button — but couldn't confirm Colombia shipping
    return { grade: 'B', reason: 'Disponible para compra, envío a Colombia no confirmado' }
  }
  return { grade: 'C', reason: 'Sin botón de compra disponible' }
}

// ── Per-product audit ─────────────────────────────────────────────────────────

async function auditOne(page: Page, product: GoldProduct): Promise<AuditResult> {
  const t0  = Date.now()
  const url = `${BASE_URL}/${product.asin}`

  const base: Omit<AuditResult, 'grade' | 'gradeReason' | 'elapsed'> = {
    id:              product.id,
    asin:            product.asin,
    category:        product.category,
    title:           product.title,
    url,
    pageAlive:       false,
    blockReason:     null,
    priceVisible:    false,
    priceRaw:        null,
    mainImageOk:     false,
    addToCart:       false,
    buyNow:          false,
    featuredOffer:   false,
    shipsToColombiaText: null,
    shipsToColombiaConfirmed: null,
    currentlyUnavailable: false,
  }

  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    const httpStatus = resp?.status() ?? 0

    await sleep(2_000)

    const pageTitle  = await page.title()
    const currentUrl = page.url()
    const bodyText   = (await page.locator('body').textContent()) ?? ''

    const blockReason = detectBlock(pageTitle, currentUrl, bodyText)

    if (blockReason || httpStatus >= 400) {
      const elapsed = (Date.now() - t0) / 1000
      const r = { ...base, pageAlive: httpStatus < 400, blockReason }
      const g = grade(r)
      return { ...r, elapsed, grade: g.grade, gradeReason: g.reason }
    }

    base.pageAlive = true

    // ── Price ─────────────────────────────────────────────────────────────────
    // Note: .a-offscreen children of .priceToPay have empty textContent in this Amazon layout.
    // The working selector is .a-price .a-offscreen (visible=true, has price text).
    // Also: .priceToPay without child descends into the visible parent directly.
    const priceRaw = await getText(page, [
      '.a-price .a-offscreen',        // works: visible=true, has price text
      '.priceToPay',                  // parent div: has full price text
      '#corePriceDisplay_desktop_feature_div', // whole price block
      '.a-price-whole',               // integer part only
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#price_inside_buybox',
    ])
    base.priceVisible = !!priceRaw
    base.priceRaw = priceRaw ? priceRaw.split('\n')[0].trim() : null

    // ── Main image ────────────────────────────────────────────────────────────
    base.mainImageOk = await isVisible(page, '#landingImage, #imgTagWrapperId img, #main-image-container img', 3_000)

    // ── Cart / Buy buttons ────────────────────────────────────────────────────
    base.addToCart = await isVisible(page, '#add-to-cart-button', 3_000)
    base.buyNow    = await isVisible(page, '#buy-now-button', 3_000)

    // ── Featured offer (buy box present and not "currently unavailable") ──────
    const unavailableText = bodyText.toLowerCase()
    // Use narrow unavailability check: only specific buy-box phrases.
    // "no disponible" is too broad — it fires on variant rows, accessories, related items.
    // "out of stock" also appears in third-party offers, not the main buy box.
    // Primary source of truth: if addToCart or buyNow is visible, the product IS available.
    const buyboxText = await (async () => {
      try {
        const bb = page.locator('#desktop_qualifiedBuyBox, #buybox, #availability')
        const count = await bb.count()
        if (count > 0) return (await bb.first().textContent() ?? '').toLowerCase()
        return ''
      } catch { return '' }
    })()

    base.currentlyUnavailable =
      // Cart button absent AND explicit buy-box unavailability text
      (!base.addToCart && !base.buyNow) && (
        unavailableText.includes('currently unavailable') ||
        buyboxText.includes('currently unavailable') ||
        buyboxText.includes('temporalmente no disponible') ||
        (buyboxText.includes('out of stock') && !buyboxText.includes('add to cart'))
      )

    // Featured offer: price visible AND (cart/buy button present OR buy-box has a price)
    base.featuredOffer = base.priceVisible && (base.addToCart || base.buyNow) && !base.currentlyUnavailable

    // ── Colombia shipping detection ───────────────────────────────────────────
    // Amazon shows Colombia in delivery block when IP is Colombian
    const deliverySelectors = [
      '#contextualIngressPtLabel',
      '#mir-layout-DELIVERY_BLOCK-slot-DELIVERY_MESSAGE',
      '#deliveryBlockMessage',
      '#delivery-message',
      '#exports_desktop_qualified_programs_row',
      '#almExpIFSHD',
      '#delivery-block-CONS_CS2-DELIVERY_MESSAGE',
      'div[data-csa-c-slot-id="delivery-message"]',
      '#desktop_qualifiedBuyBox span[data-csa-c-delivery]',
    ]

    const deliveryText = await getText(page, deliverySelectors)

    // Also scan first 5000 chars of body for "Colombia" near delivery context
    const bodySnippet = bodyText.slice(0, 8000).toLowerCase()
    const colombiaInBody = bodySnippet.includes('colombia')
    const shipsIntl = bodySnippet.includes('international shipping') ||
                      bodySnippet.includes('ships internationally') ||
                      bodySnippet.includes('global shipping') ||
                      bodySnippet.includes('amazon global')

    // Primary signal: Amazon serving COP prices means IP is recognized as Colombian.
    // When Amazon detects Colombia IP it shows local COP pricing AND adjusts shipping availability.
    const hasCopPriceInBody = bodyText.includes('COP') || (base.priceRaw?.includes('COP') ?? false)

    if (deliveryText) {
      base.shipsToColombiaText = deliveryText.trim().slice(0, 200)
      const dtLower = deliveryText.toLowerCase()
      if (dtLower.includes('colombia')) {
        base.shipsToColombiaConfirmed = true
      } else if (
        dtLower.includes('does not ship to') ||
        dtLower.includes('not available for shipping') ||
        dtLower.includes('no se puede enviar') ||
        (dtLower.includes('not eligible for') && dtLower.includes('international'))
      ) {
        base.shipsToColombiaConfirmed = false
      } else {
        base.shipsToColombiaConfirmed = hasCopPriceInBody ? true : null
      }
    } else if (colombiaInBody) {
      base.shipsToColombiaConfirmed = true
      base.shipsToColombiaText = '(Colombia found in page body)'
    } else if (hasCopPriceInBody) {
      // Amazon is serving COP prices → recognizes Colombian IP → product is served to Colombia
      base.shipsToColombiaConfirmed = true
      base.shipsToColombiaText = '(COP price detected — Colombian IP confirmed)'
    } else if (shipsIntl) {
      base.shipsToColombiaConfirmed = null
      base.shipsToColombiaText = '(international shipping mentioned, Colombia not confirmed)'
    } else {
      base.shipsToColombiaConfirmed = null
      base.shipsToColombiaText = null
    }

    const elapsed = (Date.now() - t0) / 1000
    const g = grade(base)
    return { ...base, elapsed, grade: g.grade, gradeReason: g.reason }

  } catch (err) {
    const elapsed = (Date.now() - t0) / 1000
    const g = grade(base)
    return {
      ...base,
      blockReason: err instanceof Error ? err.message.split('\n')[0].slice(0, 80) : String(err),
      elapsed,
      grade: g.grade,
      gradeReason: g.reason,
    }
  }
}

// ── Report persistence ─────────────────────────────────────────────────────────

function saveReport(results: AuditResult[]) {
  const summary = {
    A: results.filter(r => r.grade === 'A').length,
    B: results.filter(r => r.grade === 'B').length,
    C: results.filter(r => r.grade === 'C').length,
    D: results.filter(r => r.grade === 'D').length,
  }
  const report = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    summary,
    usablePct: Math.round(((summary.A + summary.B) / Math.max(results.length, 1)) * 100),
    results,
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')
}

// ── Main ───────────────────────────────────────────────────────────────────────

;(async () => {
  const gold = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../data/catalog-gold.json'), 'utf8'))
  const products: GoldProduct[] = gold.products

  console.log('━━━ Colombia Buyer Audit — GOODPRICE Gold Catalog ━━━━━━━━━━━━━━━')
  console.log(`  ${products.length} productos × detección Colombia`)
  console.log(`  Delay: ${DELAY_MIN/1000}–${DELAY_MAX/1000}s entre requests`)
  console.log(`  Estimado: ~${Math.round(products.length * 8 / 60)} min`)
  console.log()

  const browser: Browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1366,768',
    ],
  })

  const context: BrowserContext = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const page = await context.newPage()
  const results: AuditResult[] = []
  const totalStart = Date.now()

  const GRADE_ICON: Record<Grade, string> = { A: '✅', B: '⚠️ ', C: '🔶', D: '❌' }

  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    const n = i + 1
    process.stdout.write(`[${String(n).padStart(2)}/${products.length}] ${p.category.padEnd(13)} ${p.asin}  `)

    const result = await auditOne(page, p)
    results.push(result)

    const icon = GRADE_ICON[result.grade]
    const priceStr = result.priceRaw ? result.priceRaw.slice(0, 12) : '—'
    const cartStr  = result.addToCart ? 'cart' : result.buyNow ? 'buy ' : '—   '
    const colStr   = result.shipsToColombiaConfirmed === true  ? '🇨🇴'
                   : result.shipsToColombiaConfirmed === false ? '🚫'
                   : '❔'

    console.log(`${icon} ${result.grade}  ${priceStr.padEnd(13)} ${cartStr}  ${colStr}  ${result.elapsed.toFixed(1)}s` +
      (result.blockReason ? `  [${result.blockReason}]` : ''))

    // Incremental save every 5 products
    if (n % 5 === 0 || n === products.length) saveReport(results)

    if (i < products.length - 1) {
      const delay = randomDelay()
      process.stdout.write(`    ↳ delay ${(delay/1000).toFixed(1)}s…\n`)
      await sleep(delay)
    }
  }

  await browser.close()

  const totalMin = ((Date.now() - totalStart) / 60000).toFixed(1)

  // ── Final report ───────────────────────────────────────────────────────────
  saveReport(results)

  const A = results.filter(r => r.grade === 'A')
  const B = results.filter(r => r.grade === 'B')
  const C = results.filter(r => r.grade === 'C')
  const D = results.filter(r => r.grade === 'D')
  const usablePct = Math.round(((A.length + B.length) / results.length) * 100)

  console.log(`\n━━━ Reporte Final — ${totalMin} min ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log()
  console.log('  Clasificación | Cantidad')
  console.log('  ──────────────────────────')
  console.log(`  A — Comprable  | ${A.length}`)
  console.log(`  B — Restringido| ${B.length}`)
  console.log(`  C — No comprable| ${C.length}`)
  console.log(`  D — Muerto     | ${D.length}`)
  console.log(`  ──────────────────────────`)
  console.log(`  TOTAL          | ${results.length}`)
  console.log(`  Utilizable CL  | ${usablePct}%  (A+B)`)

  if (B.length > 0) {
    console.log('\n── Productos B (disponibles con restricciones) ─────────────────')
    B.forEach(r => console.log(`  ${r.id.padEnd(12)} ${r.asin}  ${r.gradeReason}`))
  }

  if (C.length > 0) {
    console.log('\n── Productos C (activos pero no comprables) ────────────────────')
    C.forEach(r => console.log(`  ${r.id.padEnd(12)} ${r.asin}  ${r.gradeReason}`))
  }

  if (D.length > 0) {
    console.log('\n── Productos D (muertos) ───────────────────────────────────────')
    D.forEach(r => console.log(`  ${r.id.padEnd(12)} ${r.asin}  ${r.gradeReason}`))
  }

  console.log(`\n  Reporte guardado en: data/colombia-audit.json`)
})()
