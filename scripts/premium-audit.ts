/**
 * scripts/premium-audit.ts
 *
 * Colombia Audit para los top-30 candidatos de commercialScore,
 * excluyendo suscripciones, repuestos y consumibles automáticamente.
 *
 * Genera: data/catalog-premium-candidates.json (solo si ≥20 grade A)
 * NO modifica el catálogo productivo.
 *
 * Usage: npx tsx scripts/premium-audit.ts
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

// ── Candidatos top-30 del strategic-ranking ────────────────────────────────────

const TOP30 = [
  { asin: 'B0FQFB8FMG', title: 'Apple AirPods Pro 3',                          category: 'electronica', priceUSD: 201.12 },
  { asin: 'B0FQF9ZX7P', title: 'Apple Watch Series 11 GPS 42mm',                category: 'electronica', priceUSD: 229.09 },
  { asin: 'B0DGHMNQ5Z', title: 'Apple AirPods 4',                               category: 'electronica', priceUSD: 121.50 },
  { asin: 'B0DZ75TN5F', title: 'Apple iPad 11-inch A16',                         category: 'electronica', priceUSD: 239.97 },
  { asin: 'B0CFPJYX7P', title: 'Amazon Kindle Paperwhite 16GB',                  category: 'electronica', priceUSD: 118.40 },
  { asin: 'B0BZWRLRLK', title: 'Ring Battery Doorbell',                          category: 'hogar',       priceUSD: 39.17  },
  { asin: 'B07CMS5Q6P', title: 'Logitech G305 Wireless Gaming Mouse',            category: 'gaming',      priceUSD: 19.98  },
  { asin: 'B0DCH8VDXF', title: 'Apple EarPods USB-C',                           category: 'electronica', priceUSD: 15.55  },
  { asin: 'B0F7Z4QZTT', title: 'Amazon Fire TV Stick 4K Plus',                  category: 'electronica', priceUSD: 43.52  },
  { asin: 'B08KW1KR5H', title: 'JBL Go 3 Bluetooth Speaker',                    category: 'electronica', priceUSD: 24.53  },
  { asin: 'B08R6S1M1K', title: 'QINLIANF 5-Outlet Wall Charger Surge Protector',category: 'electronica', priceUSD: null   },
  { asin: 'B0CQMRKRV5', title: 'Amazon Fire TV Stick HD',                       category: 'electronica', priceUSD: 30.46  },
  { asin: 'B0C5QRZ47P', title: 'Ring Outdoor Cam Stick Up',                     category: 'hogar',       priceUSD: 34.82  },
  { asin: 'B092J8LPWR', title: 'HANYCONY Surge Protector 8-Outlet',             category: 'electronica', priceUSD: null   },
  { asin: 'B0113UZJE2', title: 'Etekcity Digital Kitchen Scale',                 category: 'cocina',      priceUSD: 9.86   },
  { asin: 'B0B6GLQJMV', title: 'Ring Indoor Cam 1080p HD',                      category: 'hogar',       priceUSD: 43.52  },
  { asin: 'B073WJMKHN', title: 'YETI Rambler 20 oz Tumbler',                    category: 'cocina',      priceUSD: null   },
  { asin: 'B09PDLBFKY', title: '6-Ft Surge Protector 8 Outlets 4 USB',          category: 'electronica', priceUSD: 10.44  },
  { asin: 'B079M8FPTW', title: 'Rubbermaid Brilliance Food Storage Container',   category: 'cocina',      priceUSD: 21.62  },
  { asin: 'B0B27HX6P7', title: '2-Pack European Travel Plug Adapter',           category: 'herramientas', priceUSD: null  },
  { asin: 'B01K1TX77W', title: 'Rainleaf Microfiber Travel Towel',              category: 'deporte',      priceUSD: null  },
  { asin: 'B00S93EQUK', title: 'Alpha Grillers Digital Meat Thermometer',       category: 'cocina',       priceUSD: null  },
  { asin: 'B01LR5RG08', title: 'Amazon Basics Neoprene Dumbbell',              category: 'deporte',       priceUSD: null  },
]

// Exclusiones automáticas (con razón)
const EXCLUDED = [
  { asin: 'B08JHCVHTY', title: 'Blink Plus Plan',                  reason: 'suscripción'             },
  { asin: 'B00EB4ADQW', title: 'Fujifilm Instax Mini Film 20-pack',reason: 'consumible (película)'   },
  { asin: 'B076JKHDQT', title: 'Ring Rechargeable Battery Pack',   reason: 'accesorio de reemplazo'  },
  { asin: 'B00TTD9BRC', title: 'CeraVe Moisturizing Cream',        reason: 'consumible recurrente'   },
  { asin: 'B003ULL1NQ', title: 'Nutramax Cosequin for Dogs',       reason: 'suplemento/consumible'   },
  { asin: 'B0107QPFBU', title: 'Aquaphor Healing Ointment',        reason: 'consumible recurrente'   },
  { asin: 'B07VNSXY31', title: 'EZlifego Double Sided Tape',       reason: 'consumible'              },
]

// ── Config ─────────────────────────────────────────────────────────────────────

const RATE       = 4100
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const TIMEOUT    = 30_000
const PAGE_DELAY = 4_500

const OUT_PATH = path.join(__dirname, '../data/catalog-premium-candidates.json')

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function getText(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first()
      if (await el.isVisible({ timeout: 800 })) {
        const t = (await el.textContent())?.trim()
        if (t && t.length > 0) return t
      }
    } catch { /* try next */ }
  }
  return null
}

async function isVisible(page: Page, selector: string): Promise<boolean> {
  try { return await page.locator(selector).first().isVisible({ timeout: 1_200 }) }
  catch { return false }
}

// ── Audit one product ──────────────────────────────────────────────────────────

interface AuditResult {
  asin:                     string
  title:                    string
  category:                 string
  priceUSDEstimated:        number | null
  pageAlive:                boolean
  priceVisible:             boolean
  priceRaw:                 string | null
  priceUSDLive:             number | null
  imageValid:               boolean
  addToCart:                boolean
  buyNow:                   boolean
  currentlyUnavailable:     boolean
  featuredOffer:            boolean
  shipsToColombiaConfirmed: boolean
  grade:                    'A' | 'B' | 'C' | 'D'
  gradeReason:              string
  pageUrl:                  string
}

async function auditProduct(
  page: Page,
  asin: string,
  title: string,
  category: string,
  priceUSDEstimated: number | null,
): Promise<AuditResult> {
  const pageUrl = `https://www.amazon.com/dp/${asin}`
  const base: AuditResult = {
    asin, title, category, priceUSDEstimated,
    pageAlive: false, priceVisible: false, priceRaw: null, priceUSDLive: null,
    imageValid: false, addToCart: false, buyNow: false,
    currentlyUnavailable: false, featuredOffer: false,
    shipsToColombiaConfirmed: false,
    grade: 'D', gradeReason: 'not audited',
    pageUrl,
  }

  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    await sleep(2_800)

    const pageTitle = (await page.title()).toLowerCase()
    if (pageTitle.includes('captcha') || pageTitle.includes('robot') || pageTitle.includes('sorry')) {
      base.gradeReason = 'blocked/captcha'
      return base
    }
    if (pageTitle.includes('page not found') || pageTitle.includes('404') || pageTitle.includes('dogs')) {
      base.gradeReason = 'page not found'
      return base
    }

    base.pageAlive = true

    // ── Price ────────────────────────────────────────────────────────────────
    const priceRaw = await getText(page, [
      '.a-price .a-offscreen',
      '.priceToPay',
      '#corePriceDisplay_desktop_feature_div',
      '.a-price-whole',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#price_inside_buybox',
    ])
    base.priceRaw = priceRaw

    if (priceRaw) {
      base.priceVisible = true
      // Parse USD from price (COP or USD)
      const copMatch = priceRaw.match(/COP\s*([\d,. ]+)/)
      if (copMatch) {
        const cop = parseFloat(copMatch[1].replace(/[\s,]/g, ''))
        if (!isNaN(cop)) base.priceUSDLive = Math.round(cop / RATE * 100) / 100
      } else {
        const usdMatch = priceRaw.match(/\$\s*([\d,.]+)/)
        if (usdMatch) base.priceUSDLive = parseFloat(usdMatch[1].replace(',', ''))
      }
    }

    // ── Image ────────────────────────────────────────────────────────────────
    const imgSrc = await page.locator('#landingImage, #imgBlkFront, #main-image').first()
      .getAttribute('src').catch(() => null)
    base.imageValid = !!imgSrc && imgSrc.includes('media-amazon.com')

    // ── Buttons ──────────────────────────────────────────────────────────────
    base.addToCart = await isVisible(page, '#add-to-cart-button')
    base.buyNow    = await isVisible(page, '#buy-now-button')

    // ── Unavailability (buy-box scoped) ──────────────────────────────────────
    const buyboxText = await (async () => {
      const bb = page.locator('#desktop_qualifiedBuyBox, #buybox, #availability')
      const count = await bb.count()
      if (count > 0) return ((await bb.first().textContent()) ?? '').toLowerCase()
      return ''
    })()

    base.currentlyUnavailable =
      !base.addToCart && !base.buyNow && (
        buyboxText.includes('currently unavailable') ||
        buyboxText.includes('temporalmente no disponible') ||
        (buyboxText.includes('out of stock') && !buyboxText.includes('add to cart'))
      )

    // ── Ships to Colombia (COP price in body = IP recognized as Colombia) ────
    const bodyText = ((await page.locator('body').textContent()) ?? '').slice(0, 8000)
    const hasCOP = bodyText.includes('COP') || (priceRaw?.includes('COP') ?? false)
    base.shipsToColombiaConfirmed = hasCOP || base.addToCart || base.buyNow

    // ── Featured offer ───────────────────────────────────────────────────────
    base.featuredOffer = base.priceVisible && (base.addToCart || base.buyNow) && !base.currentlyUnavailable

    // ── Grade ────────────────────────────────────────────────────────────────
    if (!base.pageAlive) {
      base.grade = 'D'; base.gradeReason = 'page dead'
    } else if (base.currentlyUnavailable) {
      base.grade = 'D'; base.gradeReason = 'currently unavailable'
    } else if (base.featuredOffer && base.imageValid) {
      base.grade = 'A'; base.gradeReason = 'comprable: precio + cart + imagen'
    } else if (base.featuredOffer && !base.imageValid) {
      base.grade = 'B'; base.gradeReason = 'comprable pero imagen no CDN'
    } else if (base.priceVisible && !base.addToCart && !base.buyNow) {
      base.grade = 'C'; base.gradeReason = 'precio visible pero sin Buy Box activa'
    } else if (base.priceVisible) {
      base.grade = 'B'; base.gradeReason = 'precio visible, botones incompletos'
    } else {
      base.grade = 'C'; base.gradeReason = 'sin precio visible'
    }

  } catch (err) {
    base.gradeReason = `error: ${String(err).slice(0, 80)}`
  }

  return base
}

// ── Main ───────────────────────────────────────────────────────────────────────

;(async () => {
  console.log('━━━ Colombia Audit — Premium Candidates ━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Candidatos a auditar: ${TOP30.length}`)
  console.log(`  Exclusiones automáticas: ${EXCLUDED.length}`)
  console.log()

  console.log('  Excluidos automáticamente:')
  for (const e of EXCLUDED) {
    console.log(`    ✗ ${e.asin}  ${e.title.padEnd(40)}  [${e.reason}]`)
  }
  console.log()

  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  const ctx: BrowserContext = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const page = await ctx.newPage()
  const results: AuditResult[] = []

  for (let i = 0; i < TOP30.length; i++) {
    const { asin, title, category, priceUSD } = TOP30[i]
    process.stdout.write(`  [${String(i+1).padStart(2)}/${TOP30.length}]  ${asin}  ${title.slice(0,45).padEnd(45)}  `)

    const r = await auditProduct(page, asin, title, category, priceUSD)
    results.push(r)

    const priceStr = r.priceUSDLive ? `$${r.priceUSDLive}` : (r.priceVisible ? '?' : '—')
    const flags = [
      r.addToCart ? 'Cart' : '    ',
      r.buyNow    ? 'Buy'  : '   ',
      r.imageValid ? 'Img' : '   ',
    ].join(' ')
    console.log(`${r.grade}  ${priceStr.padStart(8)}  ${flags}  ${r.gradeReason}`)

    if (i < TOP30.length - 1) await sleep(PAGE_DELAY + Math.random() * 1500)
  }

  await browser.close()

  // ── Summary ────────────────────────────────────────────────────────────────

  const byGrade = { A: 0, B: 0, C: 0, D: 0 }
  for (const r of results) byGrade[r.grade]++

  console.log('\n━━━ Resultados ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Resultado | Cantidad')
  console.log('  ──────────────────')
  console.log(`  A         | ${byGrade.A}`)
  console.log(`  B         | ${byGrade.B}`)
  console.log(`  C         | ${byGrade.C}`)
  console.log(`  D         | ${byGrade.D}`)
  console.log(`  Total     | ${results.length}`)
  console.log(`  Excluidos | ${EXCLUDED.length}`)

  console.log('\n━━━ Detalle por producto ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Grade  ASIN         USD         Título')
  console.log('  ───────────────────────────────────────────────────────────────')
  for (const r of results.sort((a, b) => a.grade.localeCompare(b.grade))) {
    const price = r.priceUSDLive ? `$${r.priceUSDLive}` : '—'
    console.log(`    ${r.grade}    ${r.asin}  ${price.padStart(8)}  ${r.title.slice(0, 50)}`)
  }

  // ── Grade A list ───────────────────────────────────────────────────────────
  const gradeA = results.filter(r => r.grade === 'A')

  if (gradeA.length >= 20) {
    console.log(`\n✓ ${gradeA.length} candidatos A — generando catalog-premium-candidates.json`)

    const output = {
      generatedAt: new Date().toISOString(),
      totalAudited: results.length,
      totalExcluded: EXCLUDED.length,
      gradeA: gradeA.length,
      gradeB: byGrade.B,
      gradeC: byGrade.C,
      gradeD: byGrade.D,
      excluded: EXCLUDED,
      candidates: gradeA.map(r => ({
        asin:      r.asin,
        title:     r.title,
        category:  r.category,
        priceUSD:  r.priceUSDLive ?? r.priceUSDEstimated,
        rating:    null,   // to be filled from scraper if needed
        reviews:   null,
        grade:     r.grade,
        pageUrl:   r.pageUrl,
        lastAudit: new Date().toISOString().slice(0, 10),
        shipsToColombiaConfirmed: r.shipsToColombiaConfirmed,
      })),
    }

    fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8')
    console.log(`  Guardado: data/catalog-premium-candidates.json`)
  } else {
    console.log(`\n✗ Solo ${gradeA.length} candidatos A (mínimo requerido: 20). Archivo NO generado.`)
    console.log('  Revisar candidatos B para posible reclasificación manual.')
  }
})()
