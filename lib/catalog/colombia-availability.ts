/**
 * lib/catalog/colombia-availability.ts
 *
 * Colombia availability engine for the GOODPRICE public catalog.
 *
 * GOODPRICE is a Colombia-first import recommendation platform. Every visible
 * product must be realistically obtainable by Colombian buyers — products that
 * cannot be shipped to Colombia are suppressed from all public surfaces.
 *
 * Two-layer availability detection:
 *
 *   Layer 1 — Catalog fields (static, set during import):
 *     shipsToColombiaConfirmed === false → unavailable (immediately cached)
 *     shipsToColombiaConfirmed === true  → available   (immediately cached)
 *     colombiaRestriction set            → handled by Gate 2 (upstream)
 *
 *   Layer 2 — Live Amazon page analysis (async, audit runner only):
 *     Positive signals → available:
 *       • "import fees deposit" / "import fees"   (Amazon Global indicator)
 *       • "amazon global store"
 *       • "eligible for international shipping"
 *     Negative signals → unavailable:
 *       • "ships within the contiguous united states"
 *       • "not eligible for international shipping"
 *       • "cannot be shipped to your selected delivery location"
 *       • "hazardous material" / "dangerous goods"
 *       • "domestic shipping only"
 *
 * Architecture (ISR-safe — zero live fetches during render):
 *   1. Audit runner (POST /api/catalog/colombia-audit/run) populates
 *      data/catalog/colombia-availability.json from catalog fields + live checks.
 *   2. This module reads the cache synchronously at cold-start.
 *   3. Gate 10 in lib/catalog/public.ts calls isColombiaUnavailable() for O(1) lookup.
 *
 * Suppression policy (Gate 10 — conservative):
 *   Only "unavailable" suppresses. Unknown / rate-limited / unaudited = pass.
 *   This prevents false positives when Amazon rate-limits our audit requests.
 *
 * Auto-quarantine (enforced by audit runner):
 *   Products with consecutiveFails ≥ 2 are bulk-quarantined automatically.
 *
 * Public API:
 *   isColombiaUnavailable(productId)        → Gate 10 predicate (suppress if true)
 *   isColombiaShippable(productId)          → positive check (alias: !unavailable)
 *   computeColombiaAvailability(productId)  → full cached entry or null
 *   buildAvailabilityReason(productId)      → admin display string or null
 *   checkColombiaAvailability(asin)         → live check (audit runner only)
 *   analyseCatalogColombiaAvailability(ps)  → catalog-wide stats for admin
 *   loadColombiaCache() / saveColombiaCache() → disk I/O for audit runner
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { dataPath } from '@/lib/data-path'
import type { Product } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ColombiaAvailabilityStatus =
  | 'available'    // Confirmed shippable to Colombia
  | 'unavailable'  // Confirmed NOT shippable — Gate 10 suppresses
  | 'unknown'      // Not yet audited or inconclusive — NOT suppressed
  | 'rate-limited' // Amazon blocked the request — NOT suppressed

export interface ColombiaAvailabilityEntry {
  /** Catalog product ID (id field, not ASIN) */
  productId:            string
  asin:                 string
  status:               ColombiaAvailabilityStatus
  /** Whether the determination came from catalog fields or a live HTTP check */
  source:               'catalog-field' | 'live-check'
  /** HTTP status from Amazon, or null when status comes from catalog field */
  httpStatus:           number | null
  /** ISO timestamp of last check */
  checkedAt:            string
  /** Incremented on consecutive 'unavailable'. Reset to 0 on 'available'. */
  consecutiveFails:     number
  /** True when Amazon Global Store / import fees indicator was detected */
  amazonGlobalEligible: boolean | null
  /** True when "Import Fees Deposit" section was detected in page body */
  hasImportFees:        boolean | null
  /** Specific restriction text fragments found in the page */
  restrictionSignals:   string[]
  /** Human-readable reason for unavailable / rate-limited status */
  failureReason:        string | null
}

export interface ColombiaAvailabilityCache {
  /** ISO timestamp of when this audit completed */
  generatedAt: string
  /** productId → entry */
  entries:     Record<string, ColombiaAvailabilityEntry>
}

export interface CatalogColombiaReport {
  /** Total products analysed */
  total:              number
  /** Confirmed shippable to Colombia */
  available:          number
  /** Confirmed NOT shippable — suppressed from public catalog */
  unavailable:        number
  /** Not yet audited or inconclusive */
  unknown:            number
  /** Temporarily rate-limited by Amazon */
  rateLimited:        number
  /** Alias for unavailable — products hidden by Gate 10 */
  suppressedCount:    number
  /** % of audited products that are Colombia-compatible */
  compatiblePct:      number
  /** Products with Amazon Global Store / import fees detected */
  amazonGlobalCount:  number
  /** ISO timestamp of last audit, or null if never run */
  lastAuditAt:        string | null
  /** Products with consecutiveFails ≥ 2 (queued for auto-quarantine) */
  autoQuarantineReady: number
}

// ── Detection signal sets ─────────────────────────────────────────────────────

/**
 * Page-body text patterns that confirm international / Colombia availability.
 * Detected from Amazon product pages fetched from US IPs.
 */
const POSITIVE_SIGNALS: readonly string[] = [
  'import fees deposit',
  'import fees',
  'amazon global store',
  'ships from amazon.com and eligible for amazon global',
  'eligible for international shipping',
  'international shipping available',
  'amazon global',
]

/**
 * Page-body text patterns that confirm the product CANNOT ship internationally.
 * Any single match → unavailable.
 */
const NEGATIVE_SIGNALS: readonly string[] = [
  'ships within the contiguous united states',
  'continental u.s. only',
  'continental us only',
  'ships within continental us',
  'not eligible for international shipping',
  'this item cannot be shipped to your selected delivery location',
  'cannot be shipped to an international address',
  'this product is not eligible for international shipping',
  'only ships within the united states',
  'domestic shipping only',
  'ships within 50 states only',
  'this item does not ship to',
  'hazardous material',
  'dangerous goods',
  'batteries cannot be shipped internationally',
  'restricted to domestic delivery',
  'this item is not eligible to be shipped to locations outside of the us',
]

// ── File path ─────────────────────────────────────────────────────────────────

function getCachePath(): string {
  return dataPath('data', 'catalog', 'colombia-availability.json')
}

// ── Disk I/O ──────────────────────────────────────────────────────────────────

/**
 * Reads the Colombia availability cache from disk.
 * Returns null when absent, empty, or corrupt.
 */
export function loadColombiaCache(): ColombiaAvailabilityCache | null {
  const path = getCachePath()
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as ColombiaAvailabilityCache
    if (!raw.entries || typeof raw.entries !== 'object') return null
    return raw
  } catch {
    return null
  }
}

/**
 * Writes the Colombia availability cache to disk.
 * Called exclusively by the audit runner — never during render.
 */
export function saveColombiaCache(cache: ColombiaAvailabilityCache): void {
  const path = getCachePath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(cache, null, 2), 'utf8')
  } catch (err) {
    console.error('[colombia-availability] Failed to write cache:', err)
  }
}

// ── Module-level singletons (evaluated once per process / cold-start) ─────────

function buildUnavailableSet(cache: ColombiaAvailabilityCache | null): Set<string> {
  const ids = new Set<string>()
  if (!cache) return ids
  for (const [id, entry] of Object.entries(cache.entries)) {
    if (entry.status === 'unavailable') ids.add(id)
  }
  return ids
}

const _colombiaCache:  ColombiaAvailabilityCache | null = loadColombiaCache()
const _unavailableIds: Set<string>                      = buildUnavailableSet(_colombiaCache)

// ── Core predicates ───────────────────────────────────────────────────────────

/**
 * Returns true when a product is confirmed unavailable for Colombia shipping.
 * Used by Gate 10 in lib/catalog/public.ts.
 *
 * Conservative: only "unavailable" suppresses.
 * unknown / rate-limited / unaudited → false (product stays visible).
 */
export function isColombiaUnavailable(productId: string): boolean {
  return _unavailableIds.has(productId)
}

/**
 * Returns true when a product is confirmed available for Colombia shipping,
 * OR when its status is unknown / unaudited (conservative — no false suppression).
 */
export function isColombiaShippable(productId: string): boolean {
  return !_unavailableIds.has(productId)
}

/**
 * Returns the full cached availability entry, or null if not yet audited.
 */
export function computeColombiaAvailability(productId: string): ColombiaAvailabilityEntry | null {
  return _colombiaCache?.entries[productId] ?? null
}

/**
 * Returns a human-readable failure reason for admin display,
 * or null when the product is available or not yet audited.
 */
export function buildAvailabilityReason(productId: string): string | null {
  const entry = _colombiaCache?.entries[productId]
  if (!entry || entry.status !== 'unavailable') return null
  return entry.failureReason ?? 'Producto no disponible para envío a Colombia'
}

// ── Live Colombia availability check (audit runner only) ──────────────────────

export interface ColombiaCheckResult {
  status:               ColombiaAvailabilityStatus
  httpStatus:           number | null
  amazonGlobalEligible: boolean | null
  hasImportFees:        boolean | null
  restrictionSignals:   string[]
  failureReason:        string | null
}

/**
 * Performs a live HTTP check against amazon.com/dp/{ASIN} to detect
 * Colombia shipping availability signals. Returns ColombiaCheckResult — never throws.
 *
 * Signal detection works from US-based IPs (Vercel servers) because:
 *   - "Import fees deposit" section appears when Amazon Global is eligible
 *   - "Amazon Global Store" badge is IP-independent
 *   - Shipping restriction text ("ships within continental US") is always present
 *   - Hazmat/dangerous goods warnings are always shown
 *
 * Available signals  → product is internationally shippable → Colombia-compatible
 * Unavailable signals → product has explicit shipping restriction → suppressed
 * Neither detected   → unknown (conservative — product stays visible)
 *
 * ⚠ Only call from POST /api/catalog/colombia-audit/run.
 *   Never call during page renders — this performs a live network request.
 */
export async function checkColombiaAvailability(asin: string): Promise<ColombiaCheckResult> {
  const checkUrl   = `https://www.amazon.com/dp/${asin}`
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(checkUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control':   'no-cache',
      },
      redirect: 'follow',
      signal:   controller.signal,
      cache:    'no-store',
    })

    const httpStatus = res.status

    // ── Rate limiting — never suppress ────────────────────────────────────────
    if (httpStatus === 429 || httpStatus === 503 || httpStatus === 403) {
      return {
        status:               'rate-limited',
        httpStatus,
        amazonGlobalEligible: null,
        hasImportFees:        null,
        restrictionSignals:   [],
        failureReason:        `Amazon bloqueó la solicitud (HTTP ${httpStatus}) — estado no confirmado`,
      }
    }

    // ── Hard 404 — product gone entirely ─────────────────────────────────────
    if (httpStatus === 404) {
      return {
        status:               'unavailable',
        httpStatus:           404,
        amazonGlobalEligible: null,
        hasImportFees:        null,
        restrictionSignals:   ['Product page 404'],
        failureReason:        'Amazon respondió 404 — producto inexistente',
      }
    }

    // ── Read body (up to 32 KB) for signal detection ──────────────────────────
    let sample = ''
    if (res.body) {
      try {
        const reader    = res.body.getReader()
        const chunks: Uint8Array[] = []
        let   totalRead = 0
        const MAX_BYTES = 32768  // 32 KB — enough to cover delivery + shipping sections

        while (totalRead < MAX_BYTES) {
          const { value, done } = await reader.read()
          if (done) break
          chunks.push(value)
          totalRead += value.length
        }
        reader.cancel().catch(() => { /* ignore */ })

        const combined = new Uint8Array(totalRead)
        let   offset   = 0
        for (const chunk of chunks) {
          combined.set(chunk, offset)
          offset += chunk.length
        }
        sample = new TextDecoder().decode(combined).toLowerCase()
      } catch { /* body read failed — continue with empty sample */ }
    }

    // ── CAPTCHA / bot-check detected ─────────────────────────────────────────
    if (
      sample.includes('robot check') ||
      sample.includes('captcha') ||
      sample.includes('enter the characters you see') ||
      sample.includes('type the characters you see')
    ) {
      return {
        status:               'rate-limited',
        httpStatus,
        amazonGlobalEligible: null,
        hasImportFees:        null,
        restrictionSignals:   [],
        failureReason:        'CAPTCHA detectado — Amazon verificó bot, disponibilidad no confirmada',
      }
    }

    // ── Detect negative signals (explicit shipping restrictions) ──────────────
    const foundNegative: string[] = []
    for (const signal of NEGATIVE_SIGNALS) {
      if (sample.includes(signal)) foundNegative.push(signal)
    }

    if (foundNegative.length > 0) {
      const primary = foundNegative[0]
      return {
        status:               'unavailable',
        httpStatus,
        amazonGlobalEligible: false,
        hasImportFees:        false,
        restrictionSignals:   foundNegative,
        failureReason:        buildNegativeReason(primary),
      }
    }

    // ── Detect positive signals (international / Colombia eligibility) ─────────
    const foundPositive: string[] = []
    for (const signal of POSITIVE_SIGNALS) {
      if (sample.includes(signal)) foundPositive.push(signal)
    }

    if (foundPositive.length > 0) {
      const hasImportFees        = foundPositive.some(s => s.includes('import fees'))
      const amazonGlobalEligible = foundPositive.some(s => s.includes('amazon global'))
      return {
        status:               'available',
        httpStatus,
        amazonGlobalEligible: amazonGlobalEligible || hasImportFees,
        hasImportFees,
        restrictionSignals:   [],
        failureReason:        null,
      }
    }

    // ── Neither positive nor negative signals — inconclusive ──────────────────
    // Conservative: unknown products are NOT suppressed.
    return {
      status:               'unknown',
      httpStatus,
      amazonGlobalEligible: false,
      hasImportFees:        false,
      restrictionSignals:   [],
      failureReason:        null,
    }

  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return {
      status:               'unknown',
      httpStatus:           null,
      amazonGlobalEligible: null,
      hasImportFees:        null,
      restrictionSignals:   [],
      failureReason: isAbort
        ? 'Timeout — Amazon no respondió en 10 segundos'
        : `Error de red: ${err instanceof Error ? err.message : String(err)}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

function buildNegativeReason(signal: string): string {
  if (signal.includes('contiguous') || signal.includes('continental') || signal.includes('50 states') ||
      signal.includes('united states') || signal.includes('domestic')) {
    return 'Producto solo disponible en EE.UU. — no envía internacionalmente'
  }
  if (signal.includes('hazardous') || signal.includes('dangerous goods') || signal.includes('batteries')) {
    return 'Restricción de envío internacional — material peligroso o regulado'
  }
  if (signal.includes('cannot be shipped to') || signal.includes('not eligible for international')) {
    return 'Amazon indica que el producto no puede enviarse a destinos internacionales'
  }
  return 'Envío a Colombia no disponible — restricción detectada en página Amazon'
}

// ── Catalog-wide Colombia availability report (admin) ─────────────────────────

/**
 * Analyses Colombia shipping availability across a set of products.
 * O(n) — one Map lookup per product. Safe to call from server components.
 */
export function analyseCatalogColombiaAvailability(products: Product[]): CatalogColombiaReport {
  let available = 0, unavailable = 0, unknown = 0, rateLimited = 0
  let amazonGlobalCount = 0, autoQuarantineReady = 0

  for (const product of products) {
    const id    = product.id
    const entry = _colombiaCache?.entries[id]

    if (!entry) {
      unknown++
      continue
    }

    switch (entry.status) {
      case 'available':    available++;    break
      case 'unavailable':  unavailable++;  break
      case 'rate-limited': rateLimited++;  break
      default:             unknown++;      break
    }

    if (entry.amazonGlobalEligible === true) amazonGlobalCount++
    if (entry.status === 'unavailable' && entry.consecutiveFails >= 2) autoQuarantineReady++
  }

  const total         = products.length
  const audited       = available + unavailable + rateLimited
  const compatiblePct = audited > 0 ? Math.round((available / audited) * 100) : 100

  return {
    total,
    available,
    unavailable,
    unknown,
    rateLimited,
    suppressedCount:     unavailable,
    compatiblePct,
    amazonGlobalCount,
    lastAuditAt:         _colombiaCache?.generatedAt ?? null,
    autoQuarantineReady,
  }
}
