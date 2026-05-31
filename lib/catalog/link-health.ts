/**
 * lib/catalog/link-health.ts
 *
 * Link health engine for the GOODPRICE public catalog.
 *
 * GOODPRICE must never display a product that leads to a dead or removed Amazon
 * page. Every visible product must be conversion-ready — clickable, reachable,
 * and trustworthy.
 *
 * A product is "link-dead" when its Amazon page is confirmed gone:
 *   - HTTP 404
 *   - Redirect to a search page (/s?) — ASIN no longer found
 *   - Redirect to the Amazon homepage — product removed
 *   - Body contains unavailability signals ("isn't available", "looking for something")
 *
 * Architecture (ISR-safe — zero live fetches during render):
 *   1. Background audit (POST /api/catalog/link-audit/run) performs live HTTP
 *      checks and persists results to data/catalog/link-health.json.
 *   2. This module reads the disk cache synchronously at cold-start and exposes
 *      a _deadLinkIds Set for O(1) Gate 9 lookups.
 *   3. No network calls are ever made during page renders or static generation.
 *
 * Status classification:
 *   alive        Confirmed reachable (200, final URL is product-shaped)
 *   dead         Confirmed gone: 404, search redirect, homepage redirect
 *   rate-limited Amazon blocked the request (429/503/CAPTCHA) — NOT suppressed
 *   unknown      Never audited or network error — NOT suppressed
 *
 * Suppression policy (Gate 9 — conservative):
 *   Only "dead" suppresses. Rate-limited and unknown products stay visible
 *   to avoid false positives when Amazon is simply throttling our requests.
 *
 * Auto-quarantine (enforced by audit runner):
 *   Products with consecutiveFails ≥ 2 are bulk-quarantined automatically.
 *   Products confirmed dead for ≥ 7 days are flagged as archive candidates.
 *
 * Public API:
 *   isLinkSuppressible(productId)       → Gate 9 predicate
 *   isAmazonProductReachable(productId) → positive check (inverse)
 *   computeLinkHealth(productId)        → full cached entry or null
 *   buildLinkFailureReason(productId)   → admin display string or null
 *   checkAmazonLink(asin)               → live check (audit runner only)
 *   analyseCatalogLinkHealth(products)  → catalog-wide report for admin
 *   loadLinkHealthCache() / saveLinkHealthCache() → disk I/O for audit runner
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { dataPath } from '@/lib/data-path'
import type { Product } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type LinkStatus = 'alive' | 'dead' | 'unknown' | 'rate-limited'

export interface LinkHealthEntry {
  /** Catalog product ID (id field, not ASIN) */
  productId:        string
  asin:             string
  status:           LinkStatus
  /** HTTP status returned by Amazon, or null on timeout / network error */
  httpStatus:       number | null
  /** ISO timestamp of the most recent check */
  checkedAt:        string
  /** Incremented each time status === 'dead'. Reset to 0 on 'alive'. */
  consecutiveFails: number
  /** Human-readable reason for dead / rate-limited status, or null when alive */
  failureReason:    string | null
  /** Final URL after redirect-following, or null when no redirect occurred */
  redirectTarget:   string | null
}

export interface LinkHealthCache {
  /** ISO timestamp of when this audit completed */
  generatedAt: string
  /** productId → LinkHealthEntry */
  entries:     Record<string, LinkHealthEntry>
}

export interface CatalogLinkHealthReport {
  /** Total products analysed */
  total:               number
  /** Confirmed reachable */
  alive:               number
  /** Confirmed dead — suppressed from public catalog */
  dead:                number
  /** Never checked or unresolvable network error */
  unknown:             number
  /** Temporarily rate-limited by Amazon */
  rateLimited:         number
  /** Alias for dead — products hidden by Gate 9 */
  suppressedCount:     number
  /** % of audited (non-unknown) products that are alive */
  livePct:             number
  /** ISO timestamp of last full audit, or null if never run */
  lastAuditAt:         string | null
  /** Products with consecutiveFails ≥ 2 (queued for auto-quarantine) */
  autoQuarantineReady: number
  /** Products confirmed dead for ≥ 7 days (archive candidates) */
  archiveCandidates:   number
}

// ── File path ─────────────────────────────────────────────────────────────────

function getCachePath(): string {
  return dataPath('data', 'catalog', 'link-health.json')
}

// ── Disk I/O ──────────────────────────────────────────────────────────────────

/**
 * Reads the link health cache from disk.
 * Returns null when the file is absent, empty, or corrupt.
 */
export function loadLinkHealthCache(): LinkHealthCache | null {
  const path = getCachePath()
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as LinkHealthCache
    if (!raw.entries || typeof raw.entries !== 'object') return null
    return raw
  } catch {
    return null
  }
}

/**
 * Writes the link health cache to disk, creating data/catalog/ if needed.
 * Called exclusively by the audit runner — never during render.
 */
export function saveLinkHealthCache(cache: LinkHealthCache): void {
  const path = getCachePath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(cache, null, 2), 'utf8')
  } catch (err) {
    console.error('[link-health] Failed to write cache to disk:', err)
  }
}

// ── Module-level singletons (evaluated once per process / cold-start) ─────────

function buildDeadSet(cache: LinkHealthCache | null): Set<string> {
  const ids = new Set<string>()
  if (!cache) return ids
  for (const [id, entry] of Object.entries(cache.entries)) {
    if (entry.status === 'dead') ids.add(id)
  }
  return ids
}

const _linkHealthCache: LinkHealthCache | null = loadLinkHealthCache()
const _deadLinkIds:     Set<string>            = buildDeadSet(_linkHealthCache)

// ── Gate 9 status ─────────────────────────────────────────────────────────────

export interface LinkHealthStatus {
  /** True when the cache file exists and contains at least one audited entry */
  hasData:      boolean
  /** ISO timestamp of the last completed audit, or null if never run */
  lastAuditAt:  string | null
  /** Number of products confirmed dead (suppressible by Gate 9) */
  deadCount:    number
  /** Total number of products that have ever been audited */
  totalAudited: number
}

/**
 * Returns the operational status of Gate 9 (link health).
 *
 * Used by admin dashboards to surface the "never audited" state:
 * when hasData === false, Gate 9 is effectively inactive — no products
 * will be suppressed regardless of their actual Amazon page status.
 *
 * Safe to call from server components — reads from module-level singleton,
 * no additional disk I/O.
 */
export function getLinkHealthStatus(): LinkHealthStatus {
  if (!_linkHealthCache) {
    return { hasData: false, lastAuditAt: null, deadCount: 0, totalAudited: 0 }
  }
  const entries = Object.values(_linkHealthCache.entries)
  return {
    hasData:      entries.length > 0,
    lastAuditAt:  _linkHealthCache.generatedAt || null,
    deadCount:    entries.filter(e => e.status === 'dead').length,
    totalAudited: entries.length,
  }
}

// ── Core predicates ───────────────────────────────────────────────────────────

/**
 * Returns true when a product's Amazon link is confirmed dead and should be
 * suppressed from all public surfaces. Used by Gate 9 in lib/catalog/public.ts.
 *
 * Conservative: only "dead" status suppresses.
 * unknown / rate-limited / unaudited → false (product stays visible).
 */
export function isLinkSuppressible(productId: string): boolean {
  return _deadLinkIds.has(productId)
}

/**
 * Returns true when a product's Amazon link is confirmed alive, OR when it
 * has never been audited or was rate-limited (conservative — no false suppression).
 */
export function isAmazonProductReachable(productId: string): boolean {
  const entry = _linkHealthCache?.entries[productId]
  if (!entry) return true  // unaudited — assume reachable
  return entry.status === 'alive' || entry.status === 'unknown' || entry.status === 'rate-limited'
}

/**
 * Returns the full cached entry for a product, or null if not yet audited.
 */
export function computeLinkHealth(productId: string): LinkHealthEntry | null {
  return _linkHealthCache?.entries[productId] ?? null
}

/**
 * Returns a human-readable failure reason for admin display,
 * or null when the link is healthy or the product is unaudited.
 */
export function buildLinkFailureReason(productId: string): string | null {
  const entry = _linkHealthCache?.entries[productId]
  if (!entry || entry.status !== 'dead') return null
  return entry.failureReason ?? `Enlace Amazon inaccesible (HTTP ${entry.httpStatus ?? '—'})`
}

// ── Live Amazon link validator (audit runner only) ────────────────────────────

export interface LinkCheckResult {
  status:         LinkStatus
  httpStatus:     number | null
  redirectTarget: string | null
  failureReason:  string | null
}

/**
 * Performs a live HTTP check against https://www.amazon.com/dp/{ASIN}.
 * Returns a LinkCheckResult — never throws.
 *
 * Dead signals detected:
 *   - HTTP 404
 *   - Final URL redirected to /s? (search page = ASIN removed)
 *   - Final URL redirected to Amazon homepage or login page
 *   - Body sample contains product-unavailability signals
 *
 * Conservative (non-suppressing) signals:
 *   - HTTP 429, 503, 403 → rate-limited
 *   - CAPTCHA detected in body → rate-limited
 *   - Timeout (> 9 s) → unknown
 *   - Network error → unknown
 *
 * ⚠ Only call this from POST /api/catalog/link-audit/run.
 *   Never call during page renders — this performs a live network request.
 */
export async function checkAmazonLink(asin: string): Promise<LinkCheckResult> {
  const checkUrl   = `https://www.amazon.com/dp/${asin}`
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), 9000)

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

    const finalUrl   = res.url ?? checkUrl
    const httpStatus = res.status

    // ── Hard 404 — definitively dead ─────────────────────────────────────────
    if (httpStatus === 404) {
      return {
        status:         'dead',
        httpStatus:     404,
        redirectTarget: null,
        failureReason:  'Amazon respondió 404 — ASIN no existe',
      }
    }

    // ── Rate limiting — treat conservatively, never suppress ──────────────────
    if (httpStatus === 429 || httpStatus === 503 || httpStatus === 403) {
      return {
        status:         'rate-limited',
        httpStatus,
        redirectTarget: null,
        failureReason:  `Amazon bloqueó la solicitud (HTTP ${httpStatus}) — estado no confirmado`,
      }
    }

    // ── Final URL analysis after redirect-following ───────────────────────────
    const finalLower = finalUrl.toLowerCase()

    // Redirect to search page = ASIN removed / not found in catalog
    if (
      finalLower.includes('/s?') ||
      finalLower.includes('/s%3f') ||
      finalLower.includes('field-keywords') ||
      finalLower.includes('/search?')
    ) {
      return {
        status:         'dead',
        httpStatus,
        redirectTarget: finalUrl,
        failureReason:  'Redirigido a búsqueda Amazon — ASIN eliminado o no encontrado',
      }
    }

    // Redirect to homepage or account pages = product removed
    try {
      const parsed   = new URL(finalUrl)
      const isHome   = (parsed.pathname === '/' || parsed.pathname === '') && !parsed.search
      const isYours  = parsed.pathname.startsWith('/gp/yourstore')
      const isSignin = parsed.pathname.startsWith('/ap/signin') ||
                       parsed.pathname.startsWith('/gp/sign-in')
      if (isHome || isYours) {
        return {
          status:         'dead',
          httpStatus,
          redirectTarget: finalUrl,
          failureReason:  'Redirigido al inicio de Amazon — ASIN no encontrado',
        }
      }
      if (isSignin) {
        return {
          status:         'dead',
          httpStatus,
          redirectTarget: finalUrl,
          failureReason:  'Redirigido a login de Amazon — producto no accesible públicamente',
        }
      }
    } catch { /* invalid URL — continue to body check */ }

    // ── Body sample — first chunk only (≤ 16 KB) ─────────────────────────────
    if (httpStatus === 200 && res.body) {
      try {
        const reader    = res.body.getReader()
        const { value } = await reader.read()
        reader.cancel().catch(() => { /* ignore */ })

        if (value) {
          const sample = new TextDecoder().decode(value).toLowerCase()

          // CAPTCHA / bot-check — Amazon is blocking us, not the product
          if (
            sample.includes('robot check') ||
            sample.includes('captcha') ||
            sample.includes('enter the characters you see') ||
            sample.includes('type the characters you see')
          ) {
            return {
              status:         'rate-limited',
              httpStatus:     200,
              redirectTarget: null,
              failureReason:  'CAPTCHA detectado — Amazon verificó bot, estado no confirmado',
            }
          }

          // Definitive product-unavailability signals
          if (
            sample.includes("isn't available") ||
            sample.includes('is not available in') ||
            sample.includes('looking for something') ||
            sample.includes('no result found') ||
            sample.includes('document not found') ||
            sample.includes('this listing has ended') ||
            sample.includes('page not found') ||
            sample.includes('no longer available') ||
            sample.includes('item is unavailable')
          ) {
            return {
              status:         'dead',
              httpStatus:     200,
              redirectTarget: null,
              failureReason:  'Página Amazon indica que el producto no está disponible',
            }
          }
        }
      } catch { /* body read failed — assume alive */ }
    }

    // ── All clear — product page is reachable ─────────────────────────────────
    return {
      status:         'alive',
      httpStatus,
      redirectTarget: finalUrl !== checkUrl ? finalUrl : null,
      failureReason:  null,
    }

  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return {
      status:         'unknown',
      httpStatus:     null,
      redirectTarget: null,
      failureReason:  isAbort
        ? 'Timeout — Amazon no respondió en 9 segundos'
        : `Error de red: ${err instanceof Error ? err.message : String(err)}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

// ── Catalog-wide link health report (admin + monitoring) ──────────────────────

/**
 * Analyses link health across a set of products using the module-level cache.
 * O(n) — one Map lookup per product. Safe to call from server components.
 */
export function analyseCatalogLinkHealth(products: Product[]): CatalogLinkHealthReport {
  let alive = 0, dead = 0, unknown = 0, rateLimited = 0
  let autoQuarantineReady = 0, archiveCandidates = 0
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

  for (const product of products) {
    const id    = product.id
    const entry = _linkHealthCache?.entries[id]

    if (!entry) {
      unknown++
      continue
    }

    switch (entry.status) {
      case 'alive':        alive++;        break
      case 'dead':         dead++;         break
      case 'rate-limited': rateLimited++;  break
      default:             unknown++;      break
    }

    if (entry.status === 'dead') {
      if (entry.consecutiveFails >= 2) autoQuarantineReady++
      if (new Date(entry.checkedAt).getTime() < sevenDaysAgo) archiveCandidates++
    }
  }

  const total   = products.length
  const checked = alive + dead + rateLimited
  const livePct = checked > 0 ? Math.round((alive / checked) * 100) : 100

  return {
    total,
    alive,
    dead,
    unknown,
    rateLimited,
    suppressedCount:     dead,
    livePct,
    lastAuditAt:         _linkHealthCache?.generatedAt ?? null,
    autoQuarantineReady,
    archiveCandidates,
  }
}
