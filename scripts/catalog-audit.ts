/**
 * scripts/catalog-audit.ts
 *
 * Full catalog audit via Playwright.
 * Scrapes all ~198 products, classifies A/B/C/D, selects top 100.
 *
 * Outputs (new files, never overwrites existing catalog):
 *   data/catalog-audit-report.json   — full audit results
 *   data/catalog-gold.json           — top 100 selected products
 *
 * Usage:
 *   npx tsx scripts/catalog-audit.ts
 *
 * Resumable: if interrupted, partial results are on disk.
 * Re-run to continue from scratch (previous files overwritten).
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { writeFileSync, existsSync, readFileSync }                  from 'fs'
import { resolve }                                                   from 'path'

// ── Catalog import ─────────────────────────────────────────────────────────────
// We read raw ASINs + catalog metadata directly from individual files
// to avoid running through the full catalog pipeline (colombia rules, etc.)
import electronica  from '../data/catalog/electronica'
import gaming       from '../data/catalog/gaming'
import hogar        from '../data/catalog/hogar'
import cocina       from '../data/catalog/cocina'
import deporte      from '../data/catalog/deporte'
import oficina      from '../data/catalog/oficina'
import belleza      from '../data/catalog/belleza'
import mascotas     from '../data/catalog/mascotas'
import bebes        from '../data/catalog/bebes'
import herramientas from '../data/catalog/herramientas'

// ── Types ──────────────────────────────────────────────────────────────────────

type Grade = 'A' | 'B' | 'C' | 'D'

interface ScrapedFields {
  title:       string | null
  price:       string | null
  rating:      string | null
  reviewCount: string | null
  imageUrl:    string | null
}

interface AuditRecord {
  // Catalog metadata
  id:            string
  asin:          string
  category:      string
  catalogTitle:  string
  catalogRating: number
  catalogReviews:number
  catalogImage:  string
  catalogPrice:  number

  // Scraped live data
  scraped:       ScrapedFields
  httpStatus:    number
  pageTitle:     string | null
  blockReason:   string | null
  errorMsg:      string | null
  elapsed:       number         // seconds

  // Classification
  fieldsFound:   number         // 0–5
  grade:         Grade
  gradeReasons:  string[]       // why this grade
  excluded:      boolean
  excludeReason: string | null
}

interface AuditReport {
  generatedAt:  string
  totalAudited: number
  byGrade:      Record<Grade, number>
  active:       number          // grades A + B + C
  inactive:     number          // grade D
  captchas:     number
  errors:       number
  results:      AuditRecord[]
}

interface GoldEntry {
  rank:          number
  id:            string
  asin:          string
  category:      string
  grade:         Grade

  // Best available title (scraped > catalog)
  title:         string
  // Best available image (scraped if m.media-amazon, else catalog)
  image:         string
  imageSource:   'scraped' | 'catalog'

  // Scraped data
  livePrice:     string | null
  liveRating:    string | null
  liveReviews:   string | null

  // Original catalog data
  catalogPrice:  number
  catalogRating: number
  catalogReviews:number
  catalogBrand?: string
}

interface GoldReport {
  generatedAt:   string
  selected:      number
  totalAudited:  number
  selectionCriteria: string
  products:      GoldEntry[]
}

// ── All products flat ──────────────────────────────────────────────────────────

const ALL_PRODUCTS = [
  ...electronica, ...gaming,  ...hogar,   ...cocina,
  ...deporte,     ...oficina, ...belleza, ...mascotas,
  ...bebes,       ...herramientas,
]

// ── Config ─────────────────────────────────────────────────────────────────────

const BASE_URL   = 'https://www.amazon.com/dp'
const TIMEOUT    = 30_000
const DELAY_MIN  = 2_500
const DELAY_MAX  = 5_500
const GOLD_TARGET = 100

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36'

const REPORT_PATH = resolve('data/catalog-audit-report.json')
const GOLD_PATH   = resolve('data/catalog-gold.json')

// ── Helpers ────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const rand  = (min: number, max: number) => min + Math.floor(Math.random() * (max - min))

async function getText(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first()
      if (await el.isVisible({ timeout: 1_500 }).catch(() => false)) {
        const t = (await el.textContent())?.trim()
        if (t) return t
      }
    } catch { /* next */ }
  }
  return null
}

async function getAttr(page: Page, selectors: string[], attr: string): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first()
      if (await el.isVisible({ timeout: 1_500 }).catch(() => false)) {
        const v = await el.getAttribute(attr)
        if (v?.trim()) return v.trim()
      }
    } catch { /* next */ }
  }
  return null
}

function detectBlocked(title: string, url: string, body: string): string | null {
  const t = title.toLowerCase(), u = url.toLowerCase(), b = body.toLowerCase()
  if (u.includes('captcha') || b.includes('enter the characters you see below')) return 'captcha'
  if (t.includes('robot check') || b.includes('to discuss automated access to amazon')) return 'robot-check'
  if (t.includes('page not found') || b.includes('dogs of amazon')) return 'page-not-found'
  if (t.includes("sorry! we couldn") || t.includes('503')) return 'service-error'
  return null
}

// ── Grade logic ────────────────────────────────────────────────────────────────

function classify(scraped: ScrapedFields, blockReason: string | null, fieldsFound: number): { grade: Grade; reasons: string[] } {
  const reasons: string[] = []

  if (blockReason) {
    reasons.push(`page blocked: ${blockReason}`)
    return { grade: 'D', reasons }
  }
  if (fieldsFound === 0) {
    reasons.push('no fields extracted')
    return { grade: 'D', reasons }
  }

  if (fieldsFound <= 1) {
    reasons.push(`only ${fieldsFound}/5 fields`)
    return { grade: 'D', reasons }
  }

  // Parse numeric values
  const ratingNum  = scraped.rating  ? parseFloat(scraped.rating)  : null
  const reviewsNum = scraped.reviewCount ? parseInt(scraped.reviewCount, 10) : null

  // Check image CDN quality
  const isCurrentCdn = scraped.imageUrl?.includes('m.media-amazon.com') ?? false

  if (fieldsFound === 5) {
    // All fields present — check quality
    if (ratingNum !== null && ratingNum < 3.5) reasons.push(`low rating: ${ratingNum}`)
    if (reviewsNum !== null && reviewsNum < 50)  reasons.push(`few reviews: ${reviewsNum}`)
    if (!isCurrentCdn)                           reasons.push('degraded image CDN')
    if (!scraped.price)                          reasons.push('no price') // shouldn't happen, but defensive

    if (reasons.length === 0) return { grade: 'A', reasons: ['all 5 fields, current CDN, good metrics'] }
    if (reasons.length <= 1)  return { grade: 'B', reasons }
    return { grade: 'C', reasons }
  }

  if (fieldsFound === 4) {
    if (!scraped.price) reasons.push('missing: price')
    if (!scraped.title) reasons.push('missing: title')
    if (!scraped.rating) reasons.push('missing: rating')
    if (!scraped.reviewCount) reasons.push('missing: reviewCount')
    if (!scraped.imageUrl) reasons.push('missing: imageUrl')
    if (!isCurrentCdn) reasons.push('degraded image CDN')
    return { grade: 'B', reasons }
  }

  if (fieldsFound === 3) {
    if (!scraped.price)       reasons.push('missing: price')
    if (!scraped.title)       reasons.push('missing: title')
    if (!scraped.rating)      reasons.push('missing: rating')
    if (!scraped.reviewCount) reasons.push('missing: reviewCount')
    if (!scraped.imageUrl)    reasons.push('missing: imageUrl')
    return { grade: 'C', reasons }
  }

  // fieldsFound === 2
  reasons.push(`sparse extraction: only ${fieldsFound}/5 fields`)
  return { grade: 'C', reasons }
}

// ── Scrape one product ─────────────────────────────────────────────────────────

async function scrapeOne(page: Page, asin: string): Promise<{
  scraped: ScrapedFields
  httpStatus: number
  pageTitle: string | null
  blockReason: string | null
  errorMsg: string | null
  elapsed: number
  fieldsFound: number
}> {
  const t0 = Date.now()
  const empty: ScrapedFields = { title: null, price: null, rating: null, reviewCount: null, imageUrl: null }

  try {
    const response = await page.goto(`${BASE_URL}/${asin}`, {
      waitUntil: 'domcontentloaded', timeout: TIMEOUT,
    })
    const httpStatus = response?.status() ?? 0

    await sleep(1_200)

    const pageTitle  = await page.title()
    const currentUrl = page.url()
    const bodyText   = (await page.locator('body').textContent()) ?? ''
    const blocked    = detectBlocked(pageTitle, currentUrl, bodyText)

    if (blocked) {
      return { scraped: empty, httpStatus, pageTitle, blockReason: blocked, errorMsg: null,
               elapsed: (Date.now() - t0) / 1000, fieldsFound: 0 }
    }

    if (httpStatus >= 400) {
      return { scraped: empty, httpStatus, pageTitle, blockReason: 'http-error', errorMsg: `HTTP ${httpStatus}`,
               elapsed: (Date.now() - t0) / 1000, fieldsFound: 0 }
    }

    const title = await getText(page, ['#productTitle', 'span#productTitle', 'h1.a-size-large'])

    const priceRaw = await getText(page, [
      '.priceToPay .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      '.a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#price_inside_buybox',
      'span[data-a-color="price"] .a-offscreen',
    ])
    const price = priceRaw ? priceRaw.split('\n')[0].trim().replace(/(\$[\d,.]+)\1/, '$1') : null

    const ratingRaw = await getText(page, [
      '#acrPopover .a-icon-alt',
      'span[data-hook="rating-out-of-text"]',
      'i[data-hook="average-star-rating"] .a-icon-alt',
    ])
    const rating = ratingRaw ? (ratingRaw.match(/[\d.]+/)?.[0] ?? ratingRaw) : null

    const reviewCountRaw = await getText(page, ['#acrCustomerReviewText', 'span[data-hook="total-review-count"]'])
    const reviewCount = reviewCountRaw ? reviewCountRaw.replace(/[^0-9]/g, '') || reviewCountRaw : null

    const imageUrl = await getAttr(page,
      ['#landingImage', '#imgTagWrapperId img', '#main-image-container img'], 'src')

    const scraped: ScrapedFields = { title, price, rating, reviewCount, imageUrl }
    const fieldsFound = [title, price, rating, reviewCount, imageUrl].filter(Boolean).length

    return { scraped, httpStatus, pageTitle, blockReason: null, errorMsg: null,
             elapsed: (Date.now() - t0) / 1000, fieldsFound }

  } catch (err) {
    return {
      scraped: empty, httpStatus: 0, pageTitle: null, blockReason: null,
      errorMsg: err instanceof Error ? err.message.split('\n')[0] : String(err),
      elapsed: (Date.now() - t0) / 1000, fieldsFound: 0,
    }
  }
}

// ── Gold selection ─────────────────────────────────────────────────────────────

function selectGold(records: AuditRecord[]): GoldEntry[] {
  // Exclude grade D
  const eligible = records.filter(r => r.grade !== 'D')

  // Sort: A > B > C, then by reviews desc, then rating desc
  const GRADE_ORDER: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 9 }
  eligible.sort((a, b) => {
    const gd = GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade]
    if (gd !== 0) return gd
    const rd = (b.scraped.reviewCount ? parseInt(b.scraped.reviewCount) : b.catalogReviews)
             - (a.scraped.reviewCount ? parseInt(a.scraped.reviewCount) : a.catalogReviews)
    if (rd !== 0) return rd
    return (parseFloat(b.scraped.rating ?? '0') || b.catalogRating)
         - (parseFloat(a.scraped.rating ?? '0') || a.catalogRating)
  })

  const top = eligible.slice(0, GOLD_TARGET)

  return top.map((r, i) => {
    const isCurrentCdn = r.scraped.imageUrl?.includes('m.media-amazon.com') ?? false
    return {
      rank:          i + 1,
      id:            r.id,
      asin:          r.asin,
      category:      r.category,
      grade:         r.grade,
      title:         r.scraped.title ?? r.catalogTitle,
      image:         isCurrentCdn ? r.scraped.imageUrl! : r.catalogImage,
      imageSource:   isCurrentCdn ? 'scraped' : 'catalog',
      livePrice:     r.scraped.price,
      liveRating:    r.scraped.rating,
      liveReviews:   r.scraped.reviewCount,
      catalogPrice:  r.catalogPrice,
      catalogRating: r.catalogRating,
      catalogReviews:r.catalogReviews,
      catalogBrand:  undefined,
    } satisfies GoldEntry
  })
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function progressLine(n: number, total: number, p: { category: string; asin: string; grade: Grade | '…'; elapsed: number; fieldsFound: number; blockReason: string | null }): void {
  const pct  = Math.round((n / total) * 100)
  const bar  = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5))
  const icon = p.grade === 'A' ? '✅' : p.grade === 'B' ? '🟡' : p.grade === 'C' ? '⚠️ ' : p.grade === 'D' ? '⛔' : '…'
  const block = p.blockReason ? ` [${p.blockReason}]` : ''
  console.log(
    `[${String(n).padStart(3)}/${total}] ${bar} ${String(pct).padStart(3)}%  ` +
    `${p.category.padEnd(13)} ${p.asin}  ${icon} ${p.fieldsFound}/5  ${p.elapsed.toFixed(1)}s${block}`
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

;(async () => {
  const total = ALL_PRODUCTS.length
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(` GOODPRICE — Catalog Audit via Playwright`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(` Products  : ${total}`)
  console.log(` Gold target: ${GOLD_TARGET}`)
  console.log(` Output    : ${REPORT_PATH}`)
  console.log(` Gold      : ${GOLD_PATH}`)
  console.log(` Est. time : ~${Math.round(total * 6.5 / 60)} min (delays included)`)
  console.log('')

  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1366,768'],
  })
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

  const results: AuditRecord[] = []
  const runStart = Date.now()

  for (let i = 0; i < ALL_PRODUCTS.length; i++) {
    const p = ALL_PRODUCTS[i]!
    const n = i + 1

    const { scraped, httpStatus, pageTitle, blockReason, errorMsg, elapsed, fieldsFound } =
      await scrapeOne(page, p.asin)

    const { grade, reasons } = classify(scraped, blockReason, fieldsFound)

    const record: AuditRecord = {
      id:             p.id,
      asin:           p.asin,
      category:       p.category,
      catalogTitle:   p.title,
      catalogRating:  p.rating,
      catalogReviews: p.reviews,
      catalogImage:   p.image,
      catalogPrice:   p.price,
      scraped,
      httpStatus,
      pageTitle,
      blockReason,
      errorMsg,
      elapsed,
      fieldsFound,
      grade,
      gradeReasons:   reasons,
      excluded:       grade === 'D',
      excludeReason:  grade === 'D' ? reasons[0] ?? 'broken' : null,
    }
    results.push(record)

    progressLine(n, total, { category: p.category, asin: p.asin, grade, elapsed, fieldsFound, blockReason })

    // Save incrementally every 10 products
    if (n % 10 === 0 || n === total) {
      const partial: AuditReport = {
        generatedAt:  new Date().toISOString(),
        totalAudited: n,
        byGrade:      {
          A: results.filter(r => r.grade === 'A').length,
          B: results.filter(r => r.grade === 'B').length,
          C: results.filter(r => r.grade === 'C').length,
          D: results.filter(r => r.grade === 'D').length,
        },
        active:   results.filter(r => r.grade !== 'D').length,
        inactive: results.filter(r => r.grade === 'D').length,
        captchas: results.filter(r => r.blockReason === 'captcha' || r.blockReason === 'robot-check').length,
        errors:   results.filter(r => r.errorMsg !== null).length,
        results,
      }
      writeFileSync(REPORT_PATH, JSON.stringify(partial, null, 2), 'utf8')
      process.stdout.write(`  → saved ${n}/${total} to disk\n`)
    }

    if (i < ALL_PRODUCTS.length - 1) {
      const delay = rand(DELAY_MIN, DELAY_MAX)
      await sleep(delay)
    }
  }

  await browser.close()

  const runElapsed = ((Date.now() - runStart) / 1000 / 60).toFixed(1)

  // ── Final report ──────────────────────────────────────────────────────────
  const byGrade = {
    A: results.filter(r => r.grade === 'A').length,
    B: results.filter(r => r.grade === 'B').length,
    C: results.filter(r => r.grade === 'C').length,
    D: results.filter(r => r.grade === 'D').length,
  }

  const finalReport: AuditReport = {
    generatedAt:  new Date().toISOString(),
    totalAudited: total,
    byGrade,
    active:   results.filter(r => r.grade !== 'D').length,
    inactive: results.filter(r => r.grade === 'D').length,
    captchas: results.filter(r => r.blockReason === 'captcha' || r.blockReason === 'robot-check').length,
    errors:   results.filter(r => r.errorMsg !== null).length,
    results,
  }
  writeFileSync(REPORT_PATH, JSON.stringify(finalReport, null, 2), 'utf8')

  // ── Gold selection ────────────────────────────────────────────────────────
  const goldProducts = selectGold(results)
  const goldReport: GoldReport = {
    generatedAt:       new Date().toISOString(),
    selected:          goldProducts.length,
    totalAudited:      total,
    selectionCriteria: `Top ${GOLD_TARGET} by grade (A>B>C) then live reviews desc, then rating desc. Grade D excluded.`,
    products:          goldProducts,
  }
  writeFileSync(GOLD_PATH, JSON.stringify(goldReport, null, 2), 'utf8')

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(' RESULTADO FINAL')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(` Total auditado : ${total}`)
  console.log(` A (perfecto)   : ${byGrade.A}`)
  console.log(` B (bueno)      : ${byGrade.B}`)
  console.log(` C (incompleto) : ${byGrade.C}`)
  console.log(` D (roto)       : ${byGrade.D}`)
  console.log(` Activos (A+B+C): ${finalReport.active}`)
  console.log(` Inactivos (D)  : ${finalReport.inactive}`)
  console.log(` CAPTCHAs       : ${finalReport.captchas}`)
  console.log(` Errores        : ${finalReport.errors}`)
  console.log(` Gold selected  : ${goldProducts.length}`)
  console.log(` Tiempo total   : ${runElapsed} min`)
  console.log('')

  // Grade breakdown by category
  const cats = [...new Set(results.map(r => r.category))].sort()
  console.log(' Grades por categoría:')
  for (const cat of cats) {
    const cr = results.filter(r => r.category === cat)
    const counts = { A: 0, B: 0, C: 0, D: 0 }
    cr.forEach(r => counts[r.grade]++)
    console.log(`   ${cat.padEnd(14)} total=${cr.length}  A=${counts.A} B=${counts.B} C=${counts.C} D=${counts.D}`)
  }

  // Exclusion reasons
  const excluded = results.filter(r => r.grade === 'D')
  if (excluded.length > 0) {
    console.log('\n Productos excluidos del Gold (Grado D):')
    for (const r of excluded) {
      console.log(`   ${r.asin}  ${r.category.padEnd(13)}  ${r.excludeReason}`)
    }
  }

  console.log(`\n Archivos generados:`)
  console.log(`   ${REPORT_PATH}`)
  console.log(`   ${GOLD_PATH}`)
})()
