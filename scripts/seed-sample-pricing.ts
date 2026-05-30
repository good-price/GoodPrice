/**
 * Seed sample pricing data for local UI development.
 *
 * Writes realistic ML offer + 30 days of snapshot history to the file store
 * so the PriceComparisonPanel renders without needing to run the cron job.
 *
 * Usage:
 *   npx tsx scripts/seed-sample-pricing.ts
 *
 * This script is for LOCAL DEVELOPMENT ONLY.
 * It generates fake-but-realistic pricing data to test the UI.
 * Run the real cron (POST /api/pricing/check) to populate live data.
 */

import path from 'path'
import fs from 'fs/promises'

const DATA_ROOT    = path.join(process.cwd(), 'data', 'pricing')
const SNAPSHOTS_DIR = path.join(DATA_ROOT, 'snapshots')
const OFFERS_DIR    = path.join(DATA_ROOT, 'offers')

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function writeJSON(filePath: string, data: unknown) {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

// ── Sample products to seed ───────────────────────────────────────────────────

interface SeedProduct {
  productId:    string
  mlItemId:     string
  title:        string
  priceCOP:     number    // current COP price
  priceUSD:     number    // current USD price
  copPerUSD:    number
  trend:        'falling' | 'rising' | 'stable'
}

const SEED_PRODUCTS: SeedProduct[] = [
  {
    productId: 'elec-001',
    mlItemId:  'MCO1234567890',
    title:     'Apple AirPods Pro 2da Generación USB-C con Cancelación de Ruido',
    priceCOP:  1_299_000,
    priceUSD:  312.77,
    copPerUSD: 4_152,
    trend:     'falling',
  },
  {
    productId: 'game-001',
    mlItemId:  'MCO2345678901',
    title:     'Control Inalámbrico DualSense PlayStation 5',
    priceCOP:    329_900,
    priceUSD:    79.46,
    copPerUSD:  4_152,
    trend:     'stable',
  },
  {
    productId: 'ofic-001',
    mlItemId:  'MCO3456789012',
    title:     'Logitech MX Master 3S Mouse Inalámbrico Para Productividad',
    priceCOP:    549_900,
    priceUSD:   132.44,
    copPerUSD:  4_152,
    trend:     'falling',
  },
]

// ── Generate snapshot history (30 days) ──────────────────────────────────────

function generateHistory(product: SeedProduct) {
  const snapshots = []
  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1_000

  // Base price starts 15% higher 30 days ago (for 'falling' products)
  const startMultiplier =
    product.trend === 'falling' ? 1.15 :
    product.trend === 'rising'  ? 0.88 :
    1.0

  for (let day = 30; day >= 0; day--) {
    const recordedAt = new Date(now - day * DAY).toISOString()
    const progress   = 1 - (day / 30)

    // Price moves toward current price over 30 days
    const multiplier =
      product.trend === 'falling' ? startMultiplier - (startMultiplier - 1) * progress :
      product.trend === 'rising'  ? startMultiplier + (1 - startMultiplier) * progress :
      1 + (Math.random() - 0.5) * 0.03 // stable: ±1.5% noise

    // Add a little daily noise
    const noise    = 1 + (Math.random() - 0.5) * 0.02
    const copPrice = Math.round(product.priceCOP * multiplier * noise)
    const usdPrice = Math.round((copPrice / product.copPerUSD) * 100) / 100

    snapshots.push({
      id:               `snap_mercadolibre_${product.mlItemId}_${Math.floor(new Date(recordedAt).getTime() / 1000)}`,
      productId:        product.productId,
      retailerId:       'mercadolibre',
      price:            copPrice,
      currency:         'COP',
      priceUSD:         usdPrice,
      exchangeRateUsed: product.copPerUSD,
      availability:     'in_stock',
      recordedAt,
      source:           'retailer_api',
      wasAllTimeLow:    day === 0 && product.trend === 'falling',
      metadata: {
        mlItemId:    product.mlItemId,
        seeded:      true,
      },
    })
  }

  return snapshots
}

// ── Generate current offer ────────────────────────────────────────────────────

function generateOffer(product: SeedProduct) {
  const now = new Date().toISOString()
  const url = `https://articulo.mercadolibre.com.co/${product.mlItemId}`

  return {
    productId:               product.productId,
    retailerId:              'mercadolibre',
    externalId:              product.mlItemId,
    url,
    affiliateUrl:            url,
    price:                   product.priceCOP,
    currency:                'COP',
    priceUSD:                product.priceUSD,
    oldPrice:                undefined,
    discountPercent:         undefined,
    availability:            'in_stock',
    shipsToColombiaConfirmed: true,
    shippingCostEstimateUSD: 0,
    totalLandedCostUSD:      product.priceUSD,
    lastCheckedAt:           now,
    source:                  'retailer_api',
    isVerified:              true,
    validUntil:              new Date(Date.now() + 4 * 60 * 60 * 1_000).toISOString(),
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding sample pricing data...\n')

  for (const product of SEED_PRODUCTS) {
    const snapshots = generateHistory(product)
    const offer     = generateOffer(product)

    await writeJSON(
      path.join(SNAPSHOTS_DIR, `${product.productId}.json`),
      snapshots,
    )
    await writeJSON(
      path.join(OFFERS_DIR, `${product.productId}.json`),
      [offer],
    )

    console.log(`  ✓ ${product.productId} — ${product.title.slice(0, 50)}`)
    console.log(`    Price: $${product.priceUSD} USD / $ ${product.priceCOP.toLocaleString('es-CO')} COP`)
    console.log(`    Trend: ${product.trend} · ${snapshots.length} snapshots`)
    console.log()
  }

  console.log('✅ Done! Start the dev server and visit:')
  console.log('   http://localhost:3000/productos/B0CHWRXH8B  (AirPods Pro 2)')
  console.log('   http://localhost:3000/productos/B0CQKLS4RP  (DualSense PS5)')
  console.log('   http://localhost:3000/productos/B09HM94VDS  (MX Master 3S)')
}

main().catch(err => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
