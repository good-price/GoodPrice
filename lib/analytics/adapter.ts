/**
 * Analytics adapter layer — decouples the analytics API from its storage backend.
 *
 * Two adapters available:
 *
 *   MemoryAdapter  — module-level Maps. Default for local dev.
 *                    Resets on server restart. Zero config needed.
 *
 *   KVAdapter      — Upstash Redis via REST API (no npm package required).
 *                    Persistent across restarts and Vercel cold starts.
 *                    Activate by setting two env vars (see below).
 *
 * Activation (add to .env.local or Vercel dashboard → Environment Variables):
 *   KV_REST_API_URL=https://xxx.upstash.io
 *   KV_REST_API_TOKEN=AXXXxxx...
 *
 * These vars are injected automatically when you add Vercel KV to a project.
 *
 * The factory (getAdapter) returns a singleton per process.
 * To swap adapters: change env vars + restart. No code changes required.
 *
 * Upgrade path for new backends:
 *   1. Implement AnalyticsAdapter
 *   2. Return your new class from getAdapter()
 *   Done. All callers (store, metrics, API routes, admin) stay identical.
 */

import type { ProductClickStats, CategoryViewStats } from '@/types'

// ── TTL ───────────────────────────────────────────────────────────────────────

/** Rolling TTL applied to all KV keys on every write.
 *  Data auto-expires 90 days after the last recorded event. */
const KV_TTL_SECONDS = 90 * 24 * 60 * 60  // 90 days

// ── Interface ─────────────────────────────────────────────────────────────────

/**
 * AnalyticsAdapter — stable contract between store.ts and any backend.
 * All methods are async to support both in-memory (Promise.resolve) and I/O backends.
 */
export interface AnalyticsAdapter {
  /** Increment click counter for a product. Idempotent for meta fields. */
  recordProductClick(productId: string, asin: string): Promise<void>
  /** Increment view counter for a category page. */
  recordCategoryView(category: string): Promise<void>
  /** Top N products by click count, sorted desc. Pass a large number to get all. */
  getProductClicks(limit: number): Promise<ProductClickStats[]>
  /** Top N categories by view count, sorted desc. */
  getCategoryViews(limit: number): Promise<CategoryViewStats[]>
  /** Total events recorded (product clicks + category views). */
  getTotalEvents(): Promise<number>
  /** ISO timestamp of the first recorded event (or process start for MemoryAdapter). */
  getUptimeSince(): Promise<string>
  /** Wipe all analytics data. Use with care. */
  reset(): Promise<void>
}

// ── MemoryAdapter ─────────────────────────────────────────────────────────────

interface ClickEntry {
  asin: string
  clicks: number
  lastClickAt: string
}

interface ViewEntry {
  views: number
  lastViewAt: string
}

/**
 * MemoryAdapter — module-level Maps wrapped in Promise.resolve().
 * Identical behavior to the original store.ts, but conforms to AnalyticsAdapter.
 * Data is lost on server restart — correct behavior for local development.
 */
class MemoryAdapter implements AnalyticsAdapter {
  private readonly productClicks = new Map<string, ClickEntry>()
  private readonly categoryViews = new Map<string, ViewEntry>()
  private total = 0
  private readonly since = new Date().toISOString()

  async recordProductClick(productId: string, asin: string): Promise<void> {
    const existing = this.productClicks.get(productId)
    this.productClicks.set(productId, {
      asin,
      clicks: (existing?.clicks ?? 0) + 1,
      lastClickAt: new Date().toISOString(),
    })
    this.total++
  }

  async recordCategoryView(category: string): Promise<void> {
    const existing = this.categoryViews.get(category)
    this.categoryViews.set(category, {
      views: (existing?.views ?? 0) + 1,
      lastViewAt: new Date().toISOString(),
    })
    this.total++
  }

  async getProductClicks(limit: number): Promise<ProductClickStats[]> {
    return Array.from(this.productClicks.entries())
      .map(([productId, e]) => ({
        productId,
        asin: e.asin,
        clicks: e.clicks,
        lastClickAt: e.lastClickAt,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, limit)
  }

  async getCategoryViews(limit: number): Promise<CategoryViewStats[]> {
    return Array.from(this.categoryViews.entries())
      .map(([category, e]) => ({
        category,
        views: e.views,
        lastViewAt: e.lastViewAt,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit)
  }

  async getTotalEvents(): Promise<number> { return this.total }
  async getUptimeSince(): Promise<string>  { return this.since }

  async reset(): Promise<void> {
    this.productClicks.clear()
    this.categoryViews.clear()
    this.total = 0
  }
}

// ── KVAdapter ─────────────────────────────────────────────────────────────────

/**
 * KVAdapter — persists analytics to Upstash Redis via their REST API.
 * No npm package required: uses native fetch (works in Edge Runtime and Node.js).
 *
 * KV schema (all under one prefix, default "gp:analytics"):
 *   :pclicks   Hash  { productId → click_count_string }   (HINCRBY — atomic)
 *   :pmeta     Hash  { productId → JSON({asin, lastClickAt}) }
 *   :cviews    Hash  { category  → view_count_string }    (HINCRBY — atomic)
 *   :cmeta     Hash  { category  → JSON({lastViewAt}) }
 *   :total     String (integer)                           (INCR — atomic)
 *   :since     String (ISO datetime)                      (SET NX — only first write)
 *
 * All writes include EXPIRE commands for a rolling 90-day TTL.
 * TTL resets on every write — data persists as long as the site is active.
 */
class KVAdapter implements AnalyticsAdapter {
  private readonly url: string
  private readonly token: string
  private readonly prefix: string

  constructor(url: string, token: string, prefix = 'gp:analytics') {
    this.url = url.replace(/\/$/, '')  // strip trailing slash
    this.token = token
    this.prefix = prefix
  }

  // ── Low-level pipeline executor ─────────────────────────────────────────────

  /**
   * Execute a batch of Redis commands in a single HTTP round-trip.
   * Returns an array of results in the same order as the commands.
   * On any network or HTTP error, returns nulls (graceful degradation — never throws).
   */
  private async exec(commands: unknown[][]): Promise<unknown[]> {
    try {
      const res = await fetch(`${this.url}/pipeline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
        // force-dynamic: bypass Next.js fetch cache for analytics data
        cache: 'no-store',
      })

      if (!res.ok) {
        console.error(`[KVAdapter] Pipeline HTTP ${res.status}: ${res.statusText}`)
        return commands.map(() => null)
      }

      const data = await res.json() as Array<{ result: unknown; error?: string }>
      return data.map((d, i) => {
        if (d.error) console.error(`[KVAdapter] Command ${i} error:`, d.error)
        return d.result ?? null
      })
    } catch (err) {
      console.error('[KVAdapter] Network error:', err)
      return commands.map(() => null)
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Upstash REST API returns HGETALL as a plain object (not a flat array). */
  private parseHash(result: unknown): Record<string, string> {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return {}
    return result as Record<string, string>
  }

  private parseMeta<T>(json: string | undefined): Partial<T> {
    try { return json ? (JSON.parse(json) as Partial<T>) : {} }
    catch { return {} }
  }

  private k(suffix: string): string {
    return `${this.prefix}:${suffix}`
  }

  // ── AnalyticsAdapter implementation ─────────────────────────────────────────

  async recordProductClick(productId: string, asin: string): Promise<void> {
    const now = new Date().toISOString()
    await this.exec([
      // Atomic click increment
      ['HINCRBY', this.k('pclicks'), productId, 1],
      // Meta (asin + timestamp) — overwrite is idempotent for asin, intentional for timestamp
      ['HSET', this.k('pmeta'), productId, JSON.stringify({ asin, lastClickAt: now })],
      // Global event counter
      ['INCR', this.k('total')],
      // First-write timestamp (NX = "only if not exists")
      ['SET', this.k('since'), now, 'NX'],
      // Rolling 90-day TTL on all data keys
      ['EXPIRE', this.k('pclicks'), KV_TTL_SECONDS],
      ['EXPIRE', this.k('pmeta'), KV_TTL_SECONDS],
      ['EXPIRE', this.k('total'), KV_TTL_SECONDS],
    ])
  }

  async recordCategoryView(category: string): Promise<void> {
    const now = new Date().toISOString()
    await this.exec([
      ['HINCRBY', this.k('cviews'), category, 1],
      ['HSET', this.k('cmeta'), category, JSON.stringify({ lastViewAt: now })],
      ['INCR', this.k('total')],
      ['SET', this.k('since'), now, 'NX'],
      ['EXPIRE', this.k('cviews'), KV_TTL_SECONDS],
      ['EXPIRE', this.k('cmeta'), KV_TTL_SECONDS],
      ['EXPIRE', this.k('total'), KV_TTL_SECONDS],
    ])
  }

  async getProductClicks(limit: number): Promise<ProductClickStats[]> {
    const [clicksRaw, metaRaw] = await this.exec([
      ['HGETALL', this.k('pclicks')],
      ['HGETALL', this.k('pmeta')],
    ])

    const clicks = this.parseHash(clicksRaw)
    const meta = this.parseHash(metaRaw)

    return Object.entries(clicks)
      .map(([productId, countStr]) => {
        const m = this.parseMeta<{ asin?: string; lastClickAt?: string }>(meta[productId])
        return {
          productId,
          asin: m.asin ?? '',
          clicks: parseInt(countStr, 10) || 0,
          lastClickAt: m.lastClickAt ?? new Date().toISOString(),
        }
      })
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, limit)
  }

  async getCategoryViews(limit: number): Promise<CategoryViewStats[]> {
    const [viewsRaw, metaRaw] = await this.exec([
      ['HGETALL', this.k('cviews')],
      ['HGETALL', this.k('cmeta')],
    ])

    const views = this.parseHash(viewsRaw)
    const meta = this.parseHash(metaRaw)

    return Object.entries(views)
      .map(([category, countStr]) => {
        const m = this.parseMeta<{ lastViewAt?: string }>(meta[category])
        return {
          category,
          views: parseInt(countStr, 10) || 0,
          lastViewAt: m.lastViewAt ?? new Date().toISOString(),
        }
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, limit)
  }

  async getTotalEvents(): Promise<number> {
    const [result] = await this.exec([['GET', this.k('total')]])
    return parseInt(String(result ?? '0'), 10) || 0
  }

  async getUptimeSince(): Promise<string> {
    const [result] = await this.exec([['GET', this.k('since')]])
    // Fallback to now if no events have ever been recorded
    return String(result ?? new Date().toISOString())
  }

  async reset(): Promise<void> {
    await this.exec([
      ['DEL', this.k('pclicks')],
      ['DEL', this.k('pmeta')],
      ['DEL', this.k('cviews')],
      ['DEL', this.k('cmeta')],
      ['DEL', this.k('total')],
      ['DEL', this.k('since')],
    ])
  }
}

// ── Adapter factory ───────────────────────────────────────────────────────────

/** Module-level singleton — one adapter instance per Node.js process. */
let _adapter: AnalyticsAdapter | null = null

/**
 * Returns the active analytics adapter.
 *
 * Selection logic:
 *   KV_REST_API_URL + KV_REST_API_TOKEN set  → KVAdapter  (persistent, production)
 *   Otherwise                                → MemoryAdapter (ephemeral, development)
 *
 * The choice is made once per process and cached.
 * To force a specific adapter in tests, call resetAdapter() first.
 */
export function getAdapter(): AnalyticsAdapter {
  if (_adapter) return _adapter

  const url   = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN

  if (url && token) {
    console.info('[analytics] KVAdapter active — data persists to Upstash Redis')
    _adapter = new KVAdapter(url, token)
  } else {
    _adapter = new MemoryAdapter()
  }

  return _adapter
}

/** Force a new adapter instance on next getAdapter() call. Useful in tests. */
export function resetAdapter(): void {
  _adapter = null
}
