/**
 * scripts/expansion-scraper.ts
 *
 * Scrapes Amazon bestseller lists across 10 categories to generate
 * 80-120 high-confidence expansion candidates for GOODPRICE Colombia.
 *
 * Saves: data/candidate-expansion.json
 * Read-only — does NOT modify the catalog.
 *
 * Usage: npx tsx scripts/expansion-scraper.ts
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawCandidate {
  asin:               string
  title:              string
  category:           string
  categoryLabel:      string
  bsrRank:            number
  rating:             number | null
  reviewCount:        number | null
  estimatedPriceUSD:  number | null
  priceRaw:           string | null
  soldByAmazon:       boolean | null
  pageUrl:            string
}

interface ScoredCandidate extends RawCandidate {
  confidenceScore:    number
  scoreBreakdown:     string[]
}

// ── Bestseller URLs ───────────────────────────────────────────────────────────

interface CategoryTarget {
  key:    string
  label:  string
  url:    string
  page2?: string
}

const TARGETS: CategoryTarget[] = [
  {
    key:   'electronica',
    label: 'Electrónica',
    url:   'https://www.amazon.com/Best-Sellers-Electronics/zgbs/electronics/',
    page2: 'https://www.amazon.com/Best-Sellers-Electronics/zgbs/electronics/ref=zg_bs_pg_2_electronics?pg=2',
  },
  {
    key:   'gaming',
    label: 'Gaming',
    url:   'https://www.amazon.com/Best-Sellers-Video-Games/zgbs/videogames/',
    page2: 'https://www.amazon.com/Best-Sellers-Video-Games/zgbs/videogames/ref=zg_bs_pg_2_videogames?pg=2',
  },
  {
    key:   'oficina',
    label: 'Oficina / Home Office',
    url:   'https://www.amazon.com/Best-Sellers-Office-Products/zgbs/office-products/',
    page2: 'https://www.amazon.com/Best-Sellers-Office-Products/zgbs/office-products/ref=zg_bs_pg_2_office-products?pg=2',
  },
  {
    key:   'hogar',
    label: 'Hogar Inteligente',
    url:   'https://www.amazon.com/Best-Sellers-Amazon-Devices-Accessories/zgbs/amazon-devices/',
    page2: 'https://www.amazon.com/Best-Sellers-Amazon-Devices-Accessories/zgbs/amazon-devices/ref=zg_bs_pg_2_amazon-devices?pg=2',
  },
  {
    key:   'cocina',
    label: 'Cocina',
    url:   'https://www.amazon.com/Best-Sellers-Kitchen-Dining/zgbs/kitchen/',
    page2: 'https://www.amazon.com/Best-Sellers-Kitchen-Dining/zgbs/kitchen/ref=zg_bs_pg_2_kitchen?pg=2',
  },
  {
    key:   'deporte',
    label: 'Deporte / Fitness',
    url:   'https://www.amazon.com/Best-Sellers-Sports-Outdoors/zgbs/sporting-goods/',
    page2: 'https://www.amazon.com/Best-Sellers-Sports-Outdoors/zgbs/sporting-goods/ref=zg_bs_pg_2_sporting-goods?pg=2',
  },
  {
    key:   'mascotas',
    label: 'Mascotas',
    url:   'https://www.amazon.com/Best-Sellers-Pet-Supplies/zgbs/pet-supplies/',
    page2: 'https://www.amazon.com/Best-Sellers-Pet-Supplies/zgbs/pet-supplies/ref=zg_bs_pg_2_pet-supplies?pg=2',
  },
  {
    key:   'belleza',
    label: 'Belleza & Cuidado Personal',
    url:   'https://www.amazon.com/Best-Sellers-Beauty/zgbs/beauty/',
    page2: 'https://www.amazon.com/Best-Sellers-Beauty/zgbs/beauty/ref=zg_bs_pg_2_beauty?pg=2',
  },
  {
    key:   'herramientas',
    label: 'Herramientas & Mejoras del Hogar',
    url:   'https://www.amazon.com/Best-Sellers-Tools-Home-Improvement/zgbs/hi/',
    page2: 'https://www.amazon.com/Best-Sellers-Tools-Home-Improvement/zgbs/hi/ref=zg_bs_pg_2_hi?pg=2',
  },
  {
    key:   'bebes',
    label: 'Bebés',
    url:   'https://www.amazon.com/Best-Sellers-Baby/zgbs/baby-products/',
    page2: 'https://www.amazon.com/Best-Sellers-Baby/zgbs/baby-products/ref=zg_bs_pg_2_baby-products?pg=2',
  },
]

// ── Config ─────────────────────────────────────────────────────────────────

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const TIMEOUT    = 35_000
const PAGE_DELAY = 6_000
const OUT_PATH   = path.join(__dirname, '../data/candidate-expansion.json')

const EXISTING_ASINS = new Set([
  'B01LSUQSB0','B0B61XH5YT','B06Y1YD5W7','B01IHHLB3W','B07THHQMHM','B007TIE0GQ',
  'B0047BIWSK','B002IASYA8','B0000CFNBR','B00006JSUA','B07FDJMC9Q','B00JGFQTD2',
  'B01AVDVHTI','B0040EGNIU','B09WTP57Z5','B06VVS7S94','B0932QJ2JZ','B078211KBB',
  'B0874YJP92','B09XS7JWHH','B07D29QNMJ','B098FKXT8L','B07K3FN5MR','B0B2SFVRC2',
  'B0C33XXS56','B082WD5TY8','B0BP9SNVH9','B09TMN58KL','B099TJGJ91','B0CHWRXH8B',
  'B07GBZ4Q68','B08DF248LD','B086PKMZ21','B07V3G6C1F','B09C13PZX7','B0CQKLS4RP',
  'B085RMD5TP','B00FLYWNYQ','B07VVK39F7','B07R295MLS','B07QWB3H1Q','B08GH9KL4M',
  'B09B8V1LZ3','B09WZBPX7K','B0002AR0II','B07MZMLZZ3','B000UXZQ42','B00N1YPXW2',
  'B085TFF7M1','B00B21TLQU','B0148NPH9I','B07S92QBCJ','B00MIBN16O','B09HM94VDS',
  'B082QHRZFW','B08KTZ8249',
])

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function extractAsin(url: string): string | null {
  const m = url.match(/\/dp\/([A-Z0-9]{10})/)
  return m ? m[1] : null
}

// ── Scoring ────────────────────────────────────────────────────────────────

function scoreCandidate(c: RawCandidate): { score: number; breakdown: string[] } {
  const breakdown: string[] = []
  let score = 0

  if (c.bsrRank <= 10)       { score += 25; breakdown.push(`BSR top-10 (+25)`) }
  else if (c.bsrRank <= 25)  { score += 18; breakdown.push(`BSR top-25 (+18)`) }
  else if (c.bsrRank <= 50)  { score += 12; breakdown.push(`BSR top-50 (+12)`) }
  else                       { score +=  6; breakdown.push(`BSR >50 (+6)`) }

  if (!c.reviewCount) {
    score -= 5; breakdown.push('no reviews (-5)')
  } else if (c.reviewCount >= 50_000)  { score += 30; breakdown.push(`reviews ${c.reviewCount.toLocaleString()} (+30)`) }
  else if (c.reviewCount >= 10_000)    { score += 22; breakdown.push(`reviews ${c.reviewCount.toLocaleString()} (+22)`) }
  else if (c.reviewCount >= 5_000)     { score += 16; breakdown.push(`reviews ${c.reviewCount.toLocaleString()} (+16)`) }
  else if (c.reviewCount >= 1_000)     { score += 10; breakdown.push(`reviews ${c.reviewCount.toLocaleString()} (+10)`) }
  else                                 { score +=  3; breakdown.push(`reviews ${c.reviewCount.toLocaleString()} (+3)`) }

  if (!c.rating) {
    score -= 3; breakdown.push('no rating (-3)')
  } else if (c.rating >= 4.7) { score += 20; breakdown.push(`rating ${c.rating} (+20)`) }
  else if (c.rating >= 4.5)   { score += 15; breakdown.push(`rating ${c.rating} (+15)`) }
  else if (c.rating >= 4.3)   { score += 10; breakdown.push(`rating ${c.rating} (+10)`) }
  else if (c.rating >= 4.0)   { score +=  5; breakdown.push(`rating ${c.rating} (+5)`) }
  else                        { score +=  0; breakdown.push(`rating ${c.rating} (0)`) }

  if (c.estimatedPriceUSD !== null) {
    if (c.estimatedPriceUSD >= 10 && c.estimatedPriceUSD <= 200)  { score += 15; breakdown.push(`price $${c.estimatedPriceUSD} sweet spot (+15)`) }
    else if (c.estimatedPriceUSD > 200 && c.estimatedPriceUSD <= 400) { score += 10; breakdown.push(`price $${c.estimatedPriceUSD} premium (+10)`) }
    else if (c.estimatedPriceUSD > 0)                             { score +=  5; breakdown.push(`price $${c.estimatedPriceUSD} (+5)`) }
  }

  if (c.soldByAmazon === true) { score += 10; breakdown.push('sold by Amazon (+10)') }

  return { score: Math.min(100, Math.max(0, score)), breakdown }
}

// ── Core page evaluation ───────────────────────────────────────────────────

type PageItem = {
  asin: string
  title: string
  ratingText: string
  reviewText: string
  priceText: string
}

async function extractPageItems(page: Page): Promise<PageItem[]> {
  return page.evaluate(() => {
    const results: Array<{asin: string; title: string; ratingText: string; reviewText: string; priceText: string}> = []
    const seen = new Set<string>()

    // Amazon bestseller pages use [data-asin] on each card container
    // Also check li[id^="p_b_"] and .zg-item-immersion
    const containers: Element[] = []

    // Primary: elements with data-asin attribute that are product cards
    document.querySelectorAll('[data-asin]').forEach(el => {
      const asin = el.getAttribute('data-asin')
      if (asin && /^[A-Z0-9]{10}$/.test(asin) && !seen.has(asin)) {
        seen.add(asin)
        containers.push(el)
      }
    })

    // Fallback: li items in bestseller grid
    if (containers.length < 5) {
      document.querySelectorAll('li[id^="p_b_"], .zg-item-immersion').forEach(el => {
        const link = el.querySelector('a[href*="/dp/"]')
        const href = link?.getAttribute('href') ?? ''
        const m = href.match(/\/dp\/([A-Z0-9]{10})/)
        const asin = m?.[1]
        if (asin && !seen.has(asin)) {
          seen.add(asin)
          containers.push(el)
        }
      })
    }

    for (const container of containers) {
      const asin = container.getAttribute('data-asin') ||
        (container.querySelector('a[href*="/dp/"]')?.getAttribute('href')?.match(/\/dp\/([A-Z0-9]{10})/)?.[1] ?? '')

      if (!asin) continue

      // Title: find the anchor that has the product title text (not image links)
      let title = ''
      const anchors = container.querySelectorAll('a[href*="/dp/"]')
      for (const a of anchors) {
        const t = (a.textContent ?? '').trim()
        if (t.length >= 10) { title = t.slice(0, 120); break }
      }
      // Fallback: look for span/div with longer text
      if (!title) {
        const spans = container.querySelectorAll('span, div')
        for (const span of spans) {
          const t = (span.textContent ?? '').trim()
          if (t.length >= 15 && t.length <= 200 && !t.includes('\n\n')) {
            title = t.slice(0, 120)
            break
          }
        }
      }

      if (!title || title.length < 8) continue

      // Rating: look for .a-icon-alt text ("4.5 out of 5 stars")
      const ratingEl = container.querySelector('.a-icon-alt')
      const ratingText = (ratingEl?.textContent ?? '').trim()

      // Reviews: look for numbers in small text near rating
      let reviewText = ''
      const smallEls = container.querySelectorAll('.a-size-small, a[href*="customer-reviews"]')
      for (const el of smallEls) {
        const t = (el.textContent ?? '').replace(/,/g, '').trim()
        if (/^\d{2,}$/.test(t) || /\d{2,}/.test(t)) {
          reviewText = t
          break
        }
      }

      // Price: .a-price .a-offscreen is the accessible price text
      const priceEl = container.querySelector('.a-price .a-offscreen, .a-price-whole, .p13n-sc-price')
      const priceText = (priceEl?.textContent ?? '').trim()

      results.push({ asin, title, ratingText, reviewText, priceText })
    }

    return results
  })
}

// ── Scrape one bestseller page ─────────────────────────────────────────────

async function scrapeBestsellerPage(
  page: Page,
  url: string,
  category: CategoryTarget,
  startRank: number,
): Promise<RawCandidate[]> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    await sleep(3_500)

    const title = (await page.title()).toLowerCase()
    if (title.includes('captcha') || title.includes('robot') || title.includes('sorry')) {
      console.log(`    [blocked]`)
      return []
    }

    const items = await extractPageItems(page)
    console.log(`    ${items.length} products extracted`)

    const candidates: RawCandidate[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (EXISTING_ASINS.has(item.asin)) continue

      // Parse rating
      let rating: number | null = null
      const rm = item.ratingText.match(/([0-9]\.[0-9])/)
      if (rm) rating = parseFloat(rm[1])

      // Parse reviews
      let reviewCount: number | null = null
      const rev = item.reviewText.replace(/[^0-9kKmM.]/g, '')
      if (rev) {
        if (/[kK]/.test(rev)) reviewCount = Math.round(parseFloat(rev) * 1000)
        else if (/[mM]/.test(rev)) reviewCount = Math.round(parseFloat(rev) * 1_000_000)
        else { const n = parseInt(rev, 10); if (n > 0) reviewCount = n }
      }

      // Parse price
      let estimatedPriceUSD: number | null = null
      let priceRaw: string | null = null
      const pm = item.priceText.match(/\$?([0-9]+(?:[.,][0-9]{1,2})?)/)
      if (pm && item.priceText) {
        estimatedPriceUSD = parseFloat(pm[1].replace(',', ''))
        priceRaw = item.priceText.slice(0, 20)
      }

      candidates.push({
        asin: item.asin,
        title: item.title,
        category: category.key,
        categoryLabel: category.label,
        bsrRank: startRank + i,
        rating,
        reviewCount,
        estimatedPriceUSD,
        priceRaw,
        soldByAmazon: null,
        pageUrl: `https://www.amazon.com/dp/${item.asin}`,
      })
    }

    return candidates

  } catch (err) {
    console.log(`    [error]: ${err}`)
    return []
  }
}

// ── Deduplicate and filter ─────────────────────────────────────────────────

function dedup(candidates: RawCandidate[]): RawCandidate[] {
  const seen = new Set<string>()
  return candidates.filter(c => {
    if (seen.has(c.asin)) return false
    seen.add(c.asin)
    return true
  })
}

function isValidCandidate(c: RawCandidate): boolean {
  if (!c.title || c.title.length < 8) return false
  const lower = c.title.toLowerCase()
  if (lower.includes('see more') || lower.includes('sponsored') || lower.includes('gift card')) return false
  if (lower.includes('reload') || lower.includes('amazon business card')) return false
  if (!/^[A-Z0-9]{10}$/.test(c.asin)) return false
  return true
}

// ── Save ───────────────────────────────────────────────────────────────────

function saveOutput(scored: ScoredCandidate[]) {
  const output = {
    generatedAt: new Date().toISOString(),
    total: scored.length,
    byCat: {} as Record<string, number>,
    candidates: scored,
  }
  for (const c of scored) {
    output.byCat[c.category] = (output.byCat[c.category] ?? 0) + 1
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8')
}

// ── Main ───────────────────────────────────────────────────────────────────

;(async () => {
  console.log('━━━ GOODPRICE Expansion Scraper v2 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Target: 80–120 candidates from 10 categories × 2 pages`)
  console.log(`  Excluding ${EXISTING_ASINS.size} existing catalog ASINs`)
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

  const ctx: BrowserContext = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const page = await ctx.newPage()
  const allRaw: RawCandidate[] = []

  for (const target of TARGETS) {
    console.log(`\n▶ ${target.label} (${target.key})`)

    console.log(`  Page 1: ${target.url.slice(0, 70)}…`)
    const p1 = await scrapeBestsellerPage(page, target.url, target, 1)
    allRaw.push(...p1)
    console.log(`  → ${p1.length} candidates`)

    await sleep(PAGE_DELAY + Math.random() * 2000)

    if (target.page2) {
      console.log(`  Page 2: ${target.page2.slice(0, 70)}…`)
      const p2 = await scrapeBestsellerPage(page, target.page2, target, 51)
      allRaw.push(...p2)
      console.log(`  → ${p2.length} candidates`)
      await sleep(PAGE_DELAY + Math.random() * 2000)
    }
  }

  await browser.close()

  console.log(`\n━━━ Processing ${allRaw.length} raw candidates ━━━━━━━━━━━━━━━━━━━━━━`)

  const clean = dedup(allRaw.filter(isValidCandidate))
  console.log(`  After dedup + validation: ${clean.length}`)

  const scored: ScoredCandidate[] = clean.map(c => {
    const { score, breakdown } = scoreCandidate(c)
    return { ...c, confidenceScore: score, scoreBreakdown: breakdown }
  })

  scored.sort((a, b) => {
    if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore
    return (b.reviewCount ?? 0) - (a.reviewCount ?? 0)
  })

  const final = scored.slice(0, 120)
  saveOutput(final)

  // ── Report ─────────────────────────────────────────────────────────────

  const byCat: Record<string, ScoredCandidate[]> = {}
  for (const c of final) {
    if (!byCat[c.category]) byCat[c.category] = []
    byCat[c.category].push(c)
  }

  console.log('\n━━━ Resumen por categoría ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Categoría       | Candidatos')
  console.log('  ─────────────────────────────')
  for (const [cat, list] of Object.entries(byCat).sort()) {
    console.log(`  ${cat.padEnd(15)} | ${list.length}`)
  }
  console.log(`  ─────────────────────────────`)
  console.log(`  TOTAL           | ${final.length}`)

  console.log('\n━━━ TOP 30 candidatos más prometedores ━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Rank  Score  ASIN         Reviews    Rating  Precio  Categoría      Título')
  console.log('  ───────────────────────────────────────────────────────────────────────────────')

  final.slice(0, 30).forEach((c, i) => {
    const reviews = c.reviewCount ? c.reviewCount.toLocaleString() : '—'
    const rating  = c.rating ? String(c.rating) : '—'
    const price   = c.estimatedPriceUSD ? `$${c.estimatedPriceUSD}` : '—'
    const title   = c.title.slice(0, 40)
    console.log(
      `  ${String(i+1).padStart(2)}    ${String(c.confidenceScore).padStart(3)}    ${c.asin}  ${reviews.padStart(9)}  ${rating.padEnd(5)}  ${price.padEnd(7)}  ${c.category.padEnd(13)}  ${title}`
    )
  })

  console.log(`\n  Archivo guardado: data/candidate-expansion.json`)
})()
