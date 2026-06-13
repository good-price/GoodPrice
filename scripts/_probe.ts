import { chromium } from 'playwright'

;(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  const page = await ctx.newPage()

  await page.goto('https://www.amazon.com/dp/B06VVS7S94', { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(3_500)

  const title = await page.title()
  console.log('Title:', title.slice(0, 80))
  console.log('URL:', page.url().slice(0, 80))

  const selectors: string[] = [
    '.priceToPay .a-offscreen',
    '.priceToPay',
    '#corePriceDisplay_desktop_feature_div .a-offscreen',
    '#corePriceDisplay_desktop_feature_div',
    '.a-price .a-offscreen',
    '.a-price-whole',
    '.a-price',
    '#priceblock_ourprice',
    '#price_inside_buybox',
    '.apexPriceToPay',
    '.apexPriceToPay .a-offscreen',
    '#apex_offerDisplay_desktop',
    'span[data-a-color="price"]',
    '#buybox .a-color-price',
    '.a-color-price',
  ]

  console.log('\n--- Selector probe ---')
  for (const sel of selectors) {
    try {
      const count = await page.locator(sel).count()
      if (count === 0) { console.log(sel.padEnd(55) + '  (not found)'); continue }
      const vis    = await page.locator(sel).first().isVisible({ timeout: 400 }).catch(() => false)
      const text   = (await page.locator(sel).first().textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim().slice(0, 40) ?? ''
      const inner  = (await page.locator(sel).first().innerText().catch(() => ''))?.replace(/\s+/g, ' ').trim().slice(0, 40) ?? ''
      console.log(sel.padEnd(55) + `  n=${count} vis=${vis}  txt="${text}"  inner="${inner}"`)
    } catch { console.log(sel.padEnd(55) + '  ERROR') }
  }

  const cart   = await page.locator('#add-to-cart-button').isVisible({ timeout: 1_000 }).catch(() => false)
  const buyNow = await page.locator('#buy-now-button').isVisible({ timeout: 1_000 }).catch(() => false)
  console.log('\nadd-to-cart:', cart, '  buy-now:', buyNow)

  // Try body price scan
  const bodyText = (await page.locator('body').textContent()) ?? ''
  const copMatch = bodyText.match(/COP[\s\d,.]+/)
  const usdMatch = bodyText.match(/\$[\d,.]+/)
  console.log('COP in body:', copMatch?.[0]?.trim().slice(0, 30) ?? 'none')
  console.log('USD in body:', usdMatch?.[0]?.trim().slice(0, 30) ?? 'none')

  await browser.close()
})()
