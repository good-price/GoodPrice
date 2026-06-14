# Amazon Price Sync — Fase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken MercadoLibre price-check job with a working Amazon scraper that reads live prices and writes overrides when delta ≥ 3%.

**Architecture:** `fetchAndParseProduct()` (already exists in `amazon-parser.ts`) scrapes Amazon product pages without browser automation. A new `sync-amazon-prices.ts` orchestrator iterates all active catalog products, compares live vs catalog price, and calls `setOverride()` when the delta exceeds the threshold. The existing cron route `/api/pricing/check` → `runPriceCheckJob()` calls the new job.

**Tech Stack:** Next.js 14 App Router, Node.js fetch, JSON-LD + regex HTML extraction, file-based override store (`metadata-overrides.json`).

**Known limitation (Fase A):** On Vercel, `dataPath()` routes writes to `/tmp` (ephemeral per lambda). Overrides written by the cron lambda are NOT visible to user-request lambdas. This is accepted for Fase A; Fase B will add Vercel KV as the persistence layer.

---

## File map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `lib/catalog/live-truth/types.ts` | Add `finalUrl?: string` to `ExtractedProductData` |
| Modify | `lib/catalog/live-truth/amazon-parser.ts` | Capture `res.url` and return it as `finalUrl` |
| Create | `lib/pricing/jobs/sync-amazon-prices.ts` | New sync orchestrator |
| Modify | `lib/pricing/jobs/price-check.ts` | Delegate to new sync job |

---

### Task 1: Add `finalUrl` to `ExtractedProductData`

**Files:**
- Modify: `lib/catalog/live-truth/types.ts:44-56`

- [ ] **Step 1: Add field to interface**

In `types.ts`, after `rawHtmlLength: number`:
```typescript
export interface ExtractedProductData {
  title?:             string
  priceUSD?:          number
  oldPriceUSD?:       number
  availability?:      string
  availabilityStatus: AvailabilityStatus
  imageUrl?:          string
  brand?:             string
  confidence:         ExtractionConfidence
  httpStatus?:        number
  isRobotCheck:       boolean
  rawHtmlLength:      number
  /** Final URL after following HTTP redirects. Present when fetch succeeded. */
  finalUrl?:          string
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd goodprice && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors (field is optional, no callers break).

- [ ] **Step 3: Commit**

```bash
git add lib/catalog/live-truth/types.ts
git commit -m "feat(live-truth): add finalUrl to ExtractedProductData for redirect detection"
```

---

### Task 2: Capture `res.url` in the parser

**Files:**
- Modify: `lib/catalog/live-truth/amazon-parser.ts:310-390`

- [ ] **Step 1: Declare `finalUrl` and capture after fetch**

In `fetchAndParseProduct`, change the try block from:
```typescript
let html: string
let httpStatus: number

try {
  const res = await fetch(url, {
    headers: HEADERS,
    redirect: 'follow',
    signal:   AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  httpStatus = res.status
  html = await res.text()
```
To:
```typescript
let html: string
let httpStatus: number
let finalUrl: string | undefined

try {
  const res = await fetch(url, {
    headers: HEADERS,
    redirect: 'follow',
    signal:   AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  httpStatus = res.status
  finalUrl   = res.url
  html = await res.text()
```

- [ ] **Step 2: Include `finalUrl` in the main return (line ~377)**

Change the final return from:
```typescript
  return {
    title:              title       ?? undefined,
    priceUSD:           priceUSD    ?? undefined,
    oldPriceUSD:        oldPrice    ?? undefined,
    availability:       av.text     || undefined,
    availabilityStatus: av.status,
    imageUrl:           imageUrl    ?? undefined,
    brand:              brand       ?? undefined,
    confidence,
    httpStatus,
    isRobotCheck:       false,
    rawHtmlLength:      html.length,
  }
```
To:
```typescript
  return {
    title:              title       ?? undefined,
    priceUSD:           priceUSD    ?? undefined,
    oldPriceUSD:        oldPrice    ?? undefined,
    availability:       av.text     || undefined,
    availabilityStatus: av.status,
    imageUrl:           imageUrl    ?? undefined,
    brand:              brand       ?? undefined,
    confidence,
    httpStatus,
    isRobotCheck:       false,
    rawHtmlLength:      html.length,
    finalUrl,
  }
```

Note: The 404 and non-200 early-return paths do NOT need `finalUrl` because redirect detection is only relevant for 200 responses.

- [ ] **Step 3: Verify TypeScript compilation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add lib/catalog/live-truth/amazon-parser.ts
git commit -m "feat(amazon-parser): expose final URL after redirect following"
```

---

### Task 3: Create `sync-amazon-prices.ts`

**Files:**
- Create: `lib/pricing/jobs/sync-amazon-prices.ts`

- [ ] **Step 1: Write the full file**

```typescript
/**
 * lib/pricing/jobs/sync-amazon-prices.ts
 *
 * Amazon live-price sync job for GOODPRICE Fase A.
 *
 * Reads all active catalog products, scrapes each Amazon page via
 * fetchAndParseProduct(), compares against the catalog price, and writes a
 * metadata override when the delta is ≥ DELTA_THRESHOLD_PCT.
 *
 * Detects: invalid ASIN (404), ASIN redirect, unavailable product, robot block.
 *
 * File-based override store: works locally. On Vercel the store lives in /tmp
 * (ephemeral per instance) — Fase B will migrate to Vercel KV.
 *
 * SERVER-ONLY.
 */

import { fetchAndParseProduct } from '@/lib/catalog/live-truth/amazon-parser'
import { setOverride } from '@/lib/catalog/live-truth/overrides'
import { getRawProducts } from '@/data/catalog'
import type { RawProduct } from '@/types'
import type { ExtractedProductData } from '@/lib/catalog/live-truth/types'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Write an override when the absolute price delta exceeds this percentage. */
const DELTA_THRESHOLD_PCT = 3

/**
 * If the delta is larger than this, the scrape result is probably wrong
 * (product page mismatch, currency issue, robot page misdetected).
 * Skip the override rather than corrupt catalog data.
 */
const SUSPICIOUS_DELTA_PCT = 60

// ── Result types ──────────────────────────────────────────────────────────────

export type AmazonSyncStatus =
  | 'ok'           // Price within threshold — no override needed
  | 'overridden'   // Override written
  | 'unavailable'  // Product confirmed unavailable on Amazon
  | 'invalid_asin' // HTTP 404 — ASIN does not exist
  | 'redirected'   // Amazon redirected to a different ASIN
  | 'blocked'      // Amazon robot-check page
  | 'failed'       // Extraction failed (network/timeout/no price)
  | 'suspicious'   // Delta too large to trust — skipped

export interface AmazonSyncProductResult {
  productId:     string
  asin:          string
  status:        AmazonSyncStatus
  catalogPrice:  number
  livePrice?:    number
  deltaPct?:     number
  redirectedTo?: string
  reason:        string
  durationMs:    number
}

export interface AmazonPriceSyncJobResult {
  startedAt:   string
  completedAt: string
  durationMs:  number
  processed:   number
  skipped:     number
  overrides:   number
  results:     AmazonSyncProductResult[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectRedirectAsin(finalUrl: string, requestedAsin: string): string | null {
  const m = finalUrl.match(/\/dp\/([A-Z0-9]{10})/)
  return (m && m[1] !== requestedAsin) ? m[1] : null
}

function processLivePrice(
  product: RawProduct,
  extracted: ExtractedProductData,
  durationMs: number,
): { result: AmazonSyncProductResult; didOverride: boolean } {
  const { id: productId, asin, price: catalogPrice } = product

  // Redirect check (same-ASIN URL changes don't matter)
  if (extracted.finalUrl) {
    const redirectedTo = detectRedirectAsin(extracted.finalUrl, asin)
    if (redirectedTo) {
      return {
        result: { productId, asin, status: 'redirected', catalogPrice, redirectedTo, reason: `ASIN redirected to ${redirectedTo}`, durationMs },
        didOverride: false,
      }
    }
  }

  // Unavailable
  if (extracted.availabilityStatus === 'unavailable') {
    return {
      result: { productId, asin, status: 'unavailable', catalogPrice, reason: `Unavailable on Amazon (${extracted.availability ?? 'no text'})`, durationMs },
      didOverride: false,
    }
  }

  // No price extracted
  if (!extracted.priceUSD) {
    return {
      result: { productId, asin, status: 'failed', catalogPrice, reason: 'No price found on page', durationMs },
      didOverride: false,
    }
  }

  const deltaPct = ((extracted.priceUSD - catalogPrice) / catalogPrice) * 100
  const sign     = deltaPct > 0 ? '+' : ''

  // Suspicious delta — don't write
  if (Math.abs(deltaPct) > SUSPICIOUS_DELTA_PCT) {
    return {
      result: { productId, asin, status: 'suspicious', catalogPrice, livePrice: extracted.priceUSD, deltaPct, reason: `Delta ${sign}${deltaPct.toFixed(1)}% exceeds suspicious threshold — skipped`, durationMs },
      didOverride: false,
    }
  }

  // Within threshold — no action needed
  if (Math.abs(deltaPct) < DELTA_THRESHOLD_PCT) {
    return {
      result: { productId, asin, status: 'ok', catalogPrice, livePrice: extracted.priceUSD, deltaPct, reason: `Delta ${sign}${deltaPct.toFixed(1)}% within threshold`, durationMs },
      didOverride: false,
    }
  }

  // Write override
  setOverride({
    productId,
    asin,
    price:    extracted.priceUSD,
    oldPrice: extracted.oldPriceUSD ?? product.oldPrice,
    reason:   `Amazon live $${extracted.priceUSD} (catalog $${catalogPrice}, Δ ${sign}${deltaPct.toFixed(1)}%)`,
    appliedAt: new Date().toISOString(),
  })

  return {
    result: { productId, asin, status: 'overridden', catalogPrice, livePrice: extracted.priceUSD, deltaPct, reason: `Override written: $${extracted.priceUSD} (Δ ${sign}${deltaPct.toFixed(1)}%)`, durationMs },
    didOverride: true,
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run a full Amazon price sync across all active catalog products.
 *
 * Processing is sequential to avoid triggering Amazon rate-limiting.
 * Per-product errors are isolated — one failure doesn't stop the job.
 *
 * @param options.productIds - If provided, only sync these product IDs
 */
export async function runAmazonPriceSyncJob(options: {
  productIds?: string[]
} = {}): Promise<AmazonPriceSyncJobResult> {
  const startedAt = new Date().toISOString()
  const jobStart  = Date.now()

  let products = getRawProducts().filter(p => p.status !== 'inactive')

  if (options.productIds && options.productIds.length > 0) {
    const ids = new Set(options.productIds)
    products  = products.filter(p => ids.has(p.id))
  }

  const results: AmazonSyncProductResult[] = []
  let overrides = 0
  let skipped   = 0

  for (const product of products) {
    if (!product.asin) {
      skipped++
      continue
    }

    const t0 = Date.now()

    try {
      const extracted  = await fetchAndParseProduct(product.asin)
      const durationMs = Date.now() - t0

      let syncResult: AmazonSyncProductResult
      let didOverride = false

      if (extracted.httpStatus === 404) {
        syncResult = {
          productId:    product.id,
          asin:         product.asin,
          status:       'invalid_asin',
          catalogPrice: product.price,
          reason:       'HTTP 404 — ASIN not found on Amazon',
          durationMs,
        }
      } else if (extracted.isRobotCheck) {
        syncResult = {
          productId:    product.id,
          asin:         product.asin,
          status:       'blocked',
          catalogPrice: product.price,
          reason:       'Amazon robot-check page detected',
          durationMs,
        }
      } else if (extracted.confidence === 'failed') {
        syncResult = {
          productId:    product.id,
          asin:         product.asin,
          status:       'failed',
          catalogPrice: product.price,
          reason:       `Extraction failed (httpStatus: ${extracted.httpStatus ?? 'N/A'})`,
          durationMs,
        }
      } else {
        ;({ result: syncResult, didOverride } = processLivePrice(product, extracted, durationMs))
      }

      if (didOverride) overrides++
      results.push(syncResult)

      console.log(`[amazon-sync] ${product.id} (${product.asin}): ${syncResult.status} — ${syncResult.reason}`)
    } catch (err) {
      results.push({
        productId:    product.id,
        asin:         product.asin,
        status:       'failed',
        catalogPrice: product.price,
        reason:       `Unexpected: ${err instanceof Error ? err.message : String(err)}`,
        durationMs:   Date.now() - t0,
      })
    }
  }

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs:  Date.now() - jobStart,
    processed:   results.length,
    skipped,
    overrides,
    results,
  }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/pricing/jobs/sync-amazon-prices.ts
git commit -m "feat(pricing): add Amazon price sync job (Fase A)"
```

---

### Task 4: Wire sync job into `price-check.ts`

**Files:**
- Modify: `lib/pricing/jobs/price-check.ts`

- [ ] **Step 1: Replace ML orchestration with Amazon sync**

Replace the entire file with:

```typescript
/**
 * GOODPRICE Pricing — Price Check Job Orchestrator
 *
 * Delegates to the Amazon price sync job (Fase A).
 * Called by the Vercel Cron job via POST /api/pricing/check.
 */

import { runAmazonPriceSyncJob, type AmazonSyncProductResult } from './sync-amazon-prices'

// ── Job result types ──────────────────────────────────────────────────────────

export interface PriceCheckJobResult {
  startedAt:   string
  completedAt: string
  durationMs:  number
  processed:   number
  skipped:     number
  summary: {
    success:     number
    duplicate:   number
    not_found:   number
    no_match:    number
    match_found: number
    error:       number
  }
  reports: AmazonSyncProductResult[]
}

// ── Status mapping ────────────────────────────────────────────────────────────

function toSummaryKey(
  status: AmazonSyncProductResult['status'],
): keyof PriceCheckJobResult['summary'] {
  switch (status) {
    case 'overridden':   return 'success'
    case 'ok':           return 'match_found'
    case 'invalid_asin': return 'not_found'
    case 'redirected':
    case 'unavailable':  return 'no_match'
    case 'suspicious':   return 'duplicate'
    case 'blocked':
    case 'failed':       return 'error'
  }
}

// ── Price check job ───────────────────────────────────────────────────────────

export async function runPriceCheckJob(options: {
  productIds?: string[]
  forceSearch?: boolean
} = {}): Promise<PriceCheckJobResult> {
  const sync = await runAmazonPriceSyncJob({ productIds: options.productIds })

  const summary = {
    success:     0,
    duplicate:   0,
    not_found:   0,
    no_match:    0,
    match_found: 0,
    error:       0,
  }

  for (const r of sync.results) {
    summary[toSummaryKey(r.status)]++
  }

  return {
    startedAt:   sync.startedAt,
    completedAt: sync.completedAt,
    durationMs:  sync.durationMs,
    processed:   sync.processed,
    skipped:     sync.skipped,
    summary,
    reports:     sync.results,
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatJobSummary(result: PriceCheckJobResult): string {
  const { processed, summary, durationMs } = result
  const sec = (durationMs / 1_000).toFixed(1)
  const parts = [
    `${processed} processed`,
    summary.success     > 0 ? `${summary.success} overridden`  : '',
    summary.match_found > 0 ? `${summary.match_found} ok`      : '',
    summary.no_match    > 0 ? `${summary.no_match} no_match`   : '',
    summary.not_found   > 0 ? `${summary.not_found} not_found` : '',
    summary.duplicate   > 0 ? `${summary.duplicate} suspicious`: '',
    summary.error       > 0 ? `${summary.error} error`         : '',
  ].filter(Boolean)

  return `[price-check] ${parts.join(', ')} — ${sec}s`
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/pricing/jobs/price-check.ts
git commit -m "feat(pricing): wire Amazon sync into price-check job (Fase A complete)"
```

---

## Expected result — 20 products

When the cron fires (or `POST /api/pricing/check` is called manually), each product goes through this flow:

| Product ASIN state | `status` field | `summary` key | Override written? |
|---|---|---|---|
| Price within ±3% of catalog | `ok` | `match_found` | No |
| Price changed > 3% | `overridden` | `success` | Yes |
| ASIN returns HTTP 404 | `invalid_asin` | `not_found` | No |
| Amazon redirects to new ASIN | `redirected` | `no_match` | No |
| Product unavailable | `unavailable` | `no_match` | No |
| Robot check / CAPTCHA | `blocked` | `error` | No |
| Network/timeout/extraction fail | `failed` | `error` | No |
| Delta > 60% (suspicious) | `suspicious` | `duplicate` | No |

### Sample log output

```
[amazon-sync] coci-001 (B06Y1YD5W7): ok — Delta +0.8% within threshold
[amazon-sync] coci-014 (B01IHHLB3W): overridden — Override written: $7.99 (Δ -8.2%)
[amazon-sync] elec-001 (B08N5WRWNW): blocked — Amazon robot-check page detected
...
[price-check] 20 processed, 3 overridden, 14 ok, 2 error — 62.4s
```
