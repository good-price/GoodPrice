/**
 * PA-API 5.0 HTTP Client
 *
 * Features:
 * - AWS Signature V4 signing on every request
 * - Rate limiting (1 req/s — PA-API default quota)
 * - Automatic batching (≤10 ASINs per GetItems call)
 * - Typed responses with error propagation
 * - Configurable timeout (default 15s)
 *
 * Credentials sourced from environment:
 *   PAAPI_ACCESS_KEY   — Amazon PA-API access key
 *   PAAPI_SECRET_KEY   — Amazon PA-API secret key
 *   PAAPI_PARTNER_TAG  — Associate tag (default: upgoodprice-20)
 *   PAAPI_MARKETPLACE  — Marketplace (default: www.amazon.com)
 */

import { signPaapiRequest } from './signing'
import type {
  PaapiGetItemsRequest,
  PaapiGetItemsResponse,
  PaapiItem,
  PaapiResource,
} from './types'

// ── Configuration ──────────────────────────────────────────────────────────────

const DEFAULT_RESOURCES: PaapiResource[] = [
  'Images.Primary.Large',
  'Images.Primary.Medium',
  'Images.Primary.Small',
  'ItemInfo.Title',
  'ItemInfo.ByLineInfo',
  'Offers.Listings.Price',
  'Offers.Listings.Availability.Type',
]

/** Resources needed for image-only sync (faster, fewer units consumed) */
export const IMAGE_RESOURCES: PaapiResource[] = [
  'Images.Primary.Large',
  'Images.Primary.Medium',
  'Images.Primary.Small',
  'ItemInfo.Title',
  'ItemInfo.ByLineInfo',
]

// ── Client ─────────────────────────────────────────────────────────────────────

export class PaapiClient {
  private readonly accessKey: string
  private readonly secretKey: string
  private readonly partnerTag: string
  private readonly marketplace: string
  private readonly requestDelayMs: number
  private readonly timeoutMs: number

  private lastRequestAt = 0

  constructor(options?: {
    accessKey?: string
    secretKey?: string
    partnerTag?: string
    marketplace?: string
    /** Minimum ms between requests. Default 1100 (≈1 req/s) */
    requestDelayMs?: number
    /** Per-request timeout in ms. Default 15000 */
    timeoutMs?: number
  }) {
    this.accessKey    = options?.accessKey    ?? process.env.PAAPI_ACCESS_KEY   ?? ''
    this.secretKey    = options?.secretKey    ?? process.env.PAAPI_SECRET_KEY   ?? ''
    this.partnerTag   = options?.partnerTag   ?? process.env.PAAPI_PARTNER_TAG  ?? 'upgoodprice-20'
    this.marketplace  = options?.marketplace  ?? process.env.PAAPI_MARKETPLACE  ?? 'www.amazon.com'
    this.requestDelayMs = options?.requestDelayMs ?? 1100
    this.timeoutMs      = options?.timeoutMs      ?? 15_000
  }

  /** True if credentials are present in the environment */
  get isConfigured(): boolean {
    return Boolean(this.accessKey && this.secretKey)
  }

  // ── Core request ─────────────────────────────────────────────────────────────

  /**
   * Call PA-API GetItems for up to 10 ASINs.
   * Throws on auth/network errors; returns partial results if some ASINs fail.
   */
  async getItems(
    asins: string[],
    resources: PaapiResource[] = DEFAULT_RESOURCES,
  ): Promise<PaapiGetItemsResponse> {
    if (!this.isConfigured) {
      throw new Error(
        'PA-API credentials not configured. ' +
        'Set PAAPI_ACCESS_KEY and PAAPI_SECRET_KEY in .env.local'
      )
    }
    if (asins.length === 0) throw new Error('getItems: no ASINs provided')
    if (asins.length > 10) throw new Error('getItems: max 10 ASINs per call (received ' + asins.length + ')')

    const body = JSON.stringify({
      ItemIds: asins,
      Resources: resources,
      PartnerTag: this.partnerTag,
      PartnerType: 'Associates',
      Marketplace: this.marketplace,
    } satisfies PaapiGetItemsRequest)

    const { url, headers } = signPaapiRequest(this.accessKey, this.secretKey, body)

    // Rate limiting
    await this.throttle()

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '(unreadable)')
      throw new PaapiHttpError(res.status, errBody.slice(0, 400))
    }

    return res.json() as Promise<PaapiGetItemsResponse>
  }

  // ── Batch helper ──────────────────────────────────────────────────────────────

  /**
   * Fetch many ASINs in batches of 10.
   * Returns a Map<ASIN, PaapiItem> for successful results.
   * Per-batch errors are caught and reported via `onError`.
   */
  async getItemsBatch(
    asins: string[],
    options?: {
      resources?: PaapiResource[]
      onProgress?: (done: number, total: number) => void
      onError?: (asins: string[], error: Error) => void
    },
  ): Promise<Map<string, PaapiItem>> {
    const result = new Map<string, PaapiItem>()
    const chunks = chunk(asins, 10)
    let done = 0

    for (const batch of chunks) {
      try {
        const resp = await this.getItems(batch, options?.resources ?? IMAGE_RESOURCES)
        for (const item of resp.ItemsResult?.Items ?? []) {
          result.set(item.ASIN, item)
        }
      } catch (err) {
        options?.onError?.(batch, err instanceof Error ? err : new Error(String(err)))
      }
      done += batch.length
      options?.onProgress?.(done, asins.length)
    }

    return result
  }

  // ── Rate limiter ──────────────────────────────────────────────────────────────

  private async throttle(): Promise<void> {
    const now = Date.now()
    const wait = this.requestDelayMs - (now - this.lastRequestAt)
    if (wait > 0) await sleep(wait)
    this.lastRequestAt = Date.now()
  }
}

// ── Custom error type ─────────────────────────────────────────────────────────

export class PaapiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`PA-API HTTP ${status}: ${body}`)
    this.name = 'PaapiHttpError'
  }

  /** True when credentials are wrong or expired */
  get isAuthError(): boolean {
    return this.status === 400 && this.body.includes('InvalidSignature')
  }

  /** True when the partner tag is not valid */
  get isTagError(): boolean {
    return this.body.includes('InvalidPartnerTag')
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _client: PaapiClient | null = null

/** Get the shared PA-API client (server-side singleton) */
export function getPaapiClient(): PaapiClient {
  if (!_client) _client = new PaapiClient()
  return _client
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
