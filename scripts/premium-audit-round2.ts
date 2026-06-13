/**
 * scripts/premium-audit-round2.ts
 *
 * Segunda ronda de auditoría: candidatos restantes del pool de expansión
 * (no consumibles, no en top-30, no en catálogo actual).
 * Se combina con los resultados de premium-audit.ts.
 *
 * Usage: npx tsx scripts/premium-audit-round2.ts
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const RATE       = 4100
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const TIMEOUT    = 30_000
const PAGE_DELAY = 4_500

// Grade A products from round 1 (premium-audit.ts)
const ROUND1_GRADE_A = [
  { asin: 'B092J8LPWR', title: 'HANYCONY Surge Protector 8-Outlet',       category: 'electronica', priceUSD: 10.44 },
  { asin: 'B073WJMKHN', title: 'YETI Rambler 20 oz Tumbler',               category: 'cocina',      priceUSD: 30.47 },
  { asin: 'B0B27HX6P7', title: '2-Pack European Travel Plug Adapter',      category: 'herramientas', priceUSD: 28.72 },
  { asin: 'B01K1TX77W', title: 'Rainleaf Microfiber Travel Towel',         category: 'deporte',      priceUSD: 11.31 },
  { asin: 'B00S93EQUK', title: 'Alpha Grillers Digital Meat Thermometer',  category: 'cocina',       priceUSD: 13.03 },
  { asin: 'B01LR5RG08', title: 'Amazon Basics Neoprene Dumbbell',         category: 'deporte',       priceUSD: 8.54  },
]

// Remaining viable candidates (non-consumable, non-audited, non-existing)
const ROUND2 = [
  { asin: 'B06X9NQ8GX', title: 'Amazon Basics Digital Kitchen Scale',         category: 'cocina',       priceUSD: 8    },
  { asin: 'B07PZF3QS3', title: 'KitchenAid All Purpose Kitchen Shears',       category: 'cocina',       priceUSD: 7    },
  { asin: 'B0BZYCJK89', title: 'Owala FreeSip Insulated Water Bottle',        category: 'cocina',       priceUSD: null },
  { asin: 'B0DR9GN2PM', title: 'Owala FreeSip Insulated Water Bottle Sport',  category: 'deporte',      priceUSD: null },
  { asin: 'B0CRMP3RQT', title: 'STANLEY Quencher H2.0 Tumbler 40 oz',        category: 'cocina',       priceUSD: null },
  { asin: 'B0B41MYSGP', title: 'BAND-AID Travel Ready First Aid Kit',         category: 'deporte',      priceUSD: 10   },
  { asin: 'B0824XNJSW', title: 'No-Touch Digital Thermometer for Adults',     category: 'bebes',        priceUSD: 17   },
  { asin: 'B07YDDX4JL', title: 'iBayam Heavy Duty Scissors 3-Pack',           category: 'oficina',      priceUSD: null },
  { asin: 'B07XXSYLL8', title: 'TempPro TP19H Digital Meat Thermometer',      category: 'cocina',       priceUSD: null },
  { asin: 'B0DXXYS4BJ', title: 'Roku Streaming Stick HD',                    category: 'electronica',   priceUSD: null },
]

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

interface AuditResult {
  asin: string; title: string; category: string; priceUSDEstimated: number | null
  pageAlive: boolean; priceVisible: boolean; priceRaw: string | null; priceUSDLive: number | null
  imageValid: boolean; addToCart: boolean; buyNow: boolean
  currentlyUnavailable: boolean; featuredOffer: boolean; shipsToColombiaConfirmed: boolean
  grade: 'A' | 'B' | 'C' | 'D'; gradeReason: string; pageUrl: string
}

async function auditProduct(page: Page, asin: string, title: string, category: string, priceUSDEstimated: number | null): Promise<AuditResult> {
  const pageUrl = `https://www.amazon.com/dp/${asin}`
  const base: AuditResult = {
    asin, title, category, priceUSDEstimated,
    pageAlive: false, priceVisible: false, priceRaw: null, priceUSDLive: null,
    imageValid: false, addToCart: false, buyNow: false,
    currentlyUnavailable: false, featuredOffer: false, shipsToColombiaConfirmed: false,
    grade: 'D', gradeReason: 'not audited', pageUrl,
  }

  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    await sleep(2_800)

    const pageTitle = (await page.title()).toLowerCase()
    if (pageTitle.includes('captcha') || pageTitle.includes('robot') || pageTitle.includes('sorry')) {
      base.gradeReason = 'blocked/captcha'; return base
    }
    if (pageTitle.includes('page not found') || pageTitle.includes('404') || pageTitle.includes('dogs')) {
      base.gradeReason = 'page not found'; return base
    }
    base.pageAlive = true

    const priceRaw = await getText(page, [
      '.a-price .a-offscreen',
      '.priceToPay',
      '#corePriceDisplay_desktop_feature_div',
      '.a-price-whole',
      '#priceblock_ourprice',
      '#price_inside_buybox',
    ])
    base.priceRaw = priceRaw
    if (priceRaw) {
      base.priceVisible = true
      const copMatch = priceRaw.match(/COP\s*([\d,. ]+)/)
      if (copMatch) {
        const cop = parseFloat(copMatch[1].replace(/[\s,]/g, ''))
        if (!isNaN(cop)) base.priceUSDLive = Math.round(cop / RATE * 100) / 100
      } else {
        const usdMatch = priceRaw.match(/\$\s*([\d,.]+)/)
        if (usdMatch) base.priceUSDLive = parseFloat(usdMatch[1].replace(',', ''))
      }
    }

    const imgSrc = await page.locator('#landingImage, #imgBlkFront, #main-image').first()
      .getAttribute('src').catch(() => null)
    base.imageValid = !!imgSrc && imgSrc.includes('media-amazon.com')

    base.addToCart = await isVisible(page, '#add-to-cart-button')
    base.buyNow    = await isVisible(page, '#buy-now-button')

    const buyboxText = await (async () => {
      const bb = page.locator('#desktop_qualifiedBuyBox, #buybox, #availability')
      if (await bb.count() > 0) return ((await bb.first().textContent()) ?? '').toLowerCase()
      return ''
    })()

    base.currentlyUnavailable =
      !base.addToCart && !base.buyNow && (
        buyboxText.includes('currently unavailable') ||
        buyboxText.includes('temporalmente no disponible') ||
        (buyboxText.includes('out of stock') && !buyboxText.includes('add to cart'))
      )

    const bodyText = ((await page.locator('body').textContent()) ?? '').slice(0, 8000)
    base.shipsToColombiaConfirmed = bodyText.includes('COP') || base.addToCart || base.buyNow

    base.featuredOffer = base.priceVisible && (base.addToCart || base.buyNow) && !base.currentlyUnavailable

    if (!base.pageAlive)              { base.grade = 'D'; base.gradeReason = 'page dead' }
    else if (base.currentlyUnavailable) { base.grade = 'D'; base.gradeReason = 'currently unavailable' }
    else if (base.featuredOffer && base.imageValid) { base.grade = 'A'; base.gradeReason = 'comprable: precio + cart + imagen' }
    else if (base.featuredOffer && !base.imageValid) { base.grade = 'B'; base.gradeReason = 'comprable pero imagen no CDN' }
    else if (base.priceVisible && !base.addToCart && !base.buyNow) { base.grade = 'C'; base.gradeReason = 'precio visible pero sin Buy Box activa' }
    else if (base.priceVisible) { base.grade = 'B'; base.gradeReason = 'precio visible, botones incompletos' }
    else { base.grade = 'C'; base.gradeReason = 'sin precio visible' }

  } catch (err) {
    base.gradeReason = `error: ${String(err).slice(0, 80)}`
  }

  return base
}

;(async () => {
  console.log('━━━ Colombia Audit — Round 2 (remaining pool) ━━━━━━━━━━━━━━━━━━━')
  console.log(`  Candidatos: ${ROUND2.length}`)
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
  const round2Results: AuditResult[] = []

  for (let i = 0; i < ROUND2.length; i++) {
    const { asin, title, category, priceUSD } = ROUND2[i]
    process.stdout.write(`  [${String(i+1).padStart(2)}/${ROUND2.length}]  ${asin}  ${title.slice(0,45).padEnd(45)}  `)

    const r = await auditProduct(page, asin, title, category, priceUSD)
    round2Results.push(r)

    const priceStr = r.priceUSDLive ? `$${r.priceUSDLive}` : (r.priceVisible ? '?' : '—')
    const flags = [r.addToCart ? 'Cart' : '    ', r.buyNow ? 'Buy' : '   ', r.imageValid ? 'Img' : '   '].join(' ')
    console.log(`${r.grade}  ${priceStr.padStart(8)}  ${flags}  ${r.gradeReason}`)

    if (i < ROUND2.length - 1) await sleep(PAGE_DELAY + Math.random() * 1500)
  }

  await browser.close()

  // ── Combine round1 + round2 ────────────────────────────────────────────────
  const round2GradeA = round2Results.filter(r => r.grade === 'A')
  const allGradeA = [
    ...ROUND1_GRADE_A.map(c => ({ ...c, grade: 'A' as const, pageUrl: `https://www.amazon.com/dp/${c.asin}`, shipsToColombiaConfirmed: true, lastAudit: '2026-06-10' })),
    ...round2GradeA.map(r => ({ asin: r.asin, title: r.title, category: r.category, priceUSD: r.priceUSDLive ?? r.priceUSDEstimated, grade: r.grade, pageUrl: r.pageUrl, shipsToColombiaConfirmed: r.shipsToColombiaConfirmed, lastAudit: new Date().toISOString().slice(0, 10) })),
  ]

  const byGrade = { A: 0, B: 0, C: 0, D: 0 }
  for (const r of round2Results) byGrade[r.grade]++

  console.log('\n━━━ Round 2 Resultados ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  A: ${byGrade.A}  B: ${byGrade.B}  C: ${byGrade.C}  D: ${byGrade.D}`)
  console.log()
  console.log('━━━ TOTAL COMBINADO (R1 + R2) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Round 1 grade A: ${ROUND1_GRADE_A.length}`)
  console.log(`  Round 2 grade A: ${round2GradeA.length}`)
  console.log(`  TOTAL grade A:   ${allGradeA.length}`)
  console.log()

  if (allGradeA.length >= 20) {
    const OUT_PATH = path.join(__dirname, '../data/catalog-premium-candidates.json')
    const EXCLUDED = [
      { asin: 'B08JHCVHTY', reason: 'suscripción' },
      { asin: 'B00EB4ADQW', reason: 'consumible (película)' },
      { asin: 'B076JKHDQT', reason: 'accesorio de reemplazo' },
      { asin: 'B00TTD9BRC', reason: 'consumible recurrente' },
      { asin: 'B003ULL1NQ', reason: 'suplemento/consumible' },
      { asin: 'B0107QPFBU', reason: 'consumible recurrente' },
      { asin: 'B07VNSXY31', reason: 'consumible' },
    ]
    const output = {
      generatedAt: new Date().toISOString(),
      totalAudited: 23 + ROUND2.length,
      totalExcluded: EXCLUDED.length,
      gradeA: allGradeA.length,
      excluded: EXCLUDED,
      candidates: allGradeA,
    }
    fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8')
    console.log(`✓ Generado: data/catalog-premium-candidates.json`)
  } else {
    console.log(`✗ ${allGradeA.length} grade A total (mínimo: 20). Archivo NO generado.`)
  }

  console.log('\n━━━ Todos los candidatos A ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  ASIN         USD       Categoría      Título')
  console.log('  ──────────────────────────────────────────────────────────────')
  for (const c of allGradeA) {
    const price = c.priceUSD ? `$${c.priceUSD}` : '—'
    console.log(`  ${c.asin}  ${price.padStart(8)}  ${c.category.padEnd(13)}  ${c.title.slice(0, 50)}`)
  }
})()
