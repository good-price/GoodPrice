/**
 * GOODPRICE Pricing — In-Memory Rate Limiter
 *
 * Token bucket algorithm for rate limiting API requests to external retailer APIs.
 * Designed for single-process use (Vercel Cron runs one function at a time).
 *
 * Token Bucket algorithm:
 *   - Bucket holds up to `capacity` tokens
 *   - Tokens refill at `refillRate` tokens/second
 *   - Each request consumes 1 token
 *   - If bucket is empty, wait until a token is available
 *
 * Usage:
 *   const limiter = getRateLimiter('amazon')
 *   await limiter.acquire()    // waits if necessary
 *   const result = await fetch(...)
 *
 * All functions are synchronous except `acquire()` which returns a Promise.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RateLimiterConfig {
  /** Maximum tokens in the bucket (burst capacity) */
  capacity: number
  /** Tokens added per second (sustained rate) */
  refillRatePerSecond: number
  /** Minimum delay between consecutive requests in ms */
  minDelayMs: number
}

export interface RateLimiter {
  /** Wait until a request slot is available, then consume one token */
  acquire(): Promise<void>
  /** Current token count (0.0 – capacity) */
  availableTokens(): number
  /** Whether a token is currently available without waiting */
  canAcquireNow(): boolean
}

// ── Per-retailer defaults ─────────────────────────────────────────────────────

export const RATE_LIMITER_CONFIGS: Record<string, RateLimiterConfig> = {
  amazon: {
    capacity:           3,
    refillRatePerSecond: 0.17, // ~10 requests/minute
    minDelayMs:          2_000,
  },
  alkosto: {
    capacity:           2,
    refillRatePerSecond: 0.08, // ~5 requests/minute
    minDelayMs:          5_000,
  },
  default: {
    capacity:           5,
    refillRatePerSecond: 0.25,
    minDelayMs:          1_000,
  },
}

// ── Token bucket implementation ───────────────────────────────────────────────

class TokenBucketLimiter implements RateLimiter {
  private tokens:      number
  private lastRefill:  number  // Date.now() timestamp
  private lastRequest: number  // Date.now() timestamp

  constructor(private readonly config: RateLimiterConfig) {
    this.tokens      = config.capacity
    this.lastRefill  = Date.now()
    this.lastRequest = 0
  }

  /** Refill tokens based on elapsed time since last refill */
  private refill(): void {
    const now     = Date.now()
    const elapsed = (now - this.lastRefill) / 1_000  // seconds
    const added   = elapsed * this.config.refillRatePerSecond

    this.tokens     = Math.min(this.config.capacity, this.tokens + added)
    this.lastRefill = now
  }

  availableTokens(): number {
    this.refill()
    return this.tokens
  }

  canAcquireNow(): boolean {
    this.refill()
    const minDelayElapsed = Date.now() - this.lastRequest >= this.config.minDelayMs
    return this.tokens >= 1 && minDelayElapsed
  }

  async acquire(): Promise<void> {
    const startedAt = Date.now()
    const maxWaitMs = 60_000 // never wait more than 1 minute

    while (true) {
      this.refill()

      const now              = Date.now()
      const sinceLastRequest = now - this.lastRequest
      const minDelayOk       = sinceLastRequest >= this.config.minDelayMs

      if (this.tokens >= 1 && minDelayOk) {
        this.tokens      -= 1
        this.lastRequest  = now
        return
      }

      if (now - startedAt > maxWaitMs) {
        throw new Error(`Rate limiter timed out after ${maxWaitMs}ms`)
      }

      // Calculate how long to wait
      let waitMs = 0

      if (this.tokens < 1) {
        // Time until 1 token is available
        const tokensNeeded = 1 - this.tokens
        const secUntilFull = tokensNeeded / this.config.refillRatePerSecond
        waitMs = Math.max(waitMs, Math.ceil(secUntilFull * 1_000))
      }

      if (!minDelayOk) {
        const delayRemaining = this.config.minDelayMs - sinceLastRequest
        waitMs = Math.max(waitMs, delayRemaining)
      }

      // Sleep at most 500ms at a time (avoid overshooting)
      await sleep(Math.min(waitMs, 500))
    }
  }
}

// ── Factory & singleton registry ──────────────────────────────────────────────

const _limiters = new Map<string, RateLimiter>()

/**
 * Get (or create) a rate limiter for a given retailer.
 * Rate limiters are module-level singletons — shared across all calls
 * within the same Node.js process.
 *
 * @param retailerId - Retailer ID (must match RATE_LIMITER_CONFIGS key or 'default')
 */
export function getRateLimiter(retailerId: string): RateLimiter {
  const existing = _limiters.get(retailerId)
  if (existing) return existing

  const config = RATE_LIMITER_CONFIGS[retailerId] ?? RATE_LIMITER_CONFIGS.default
  const limiter = new TokenBucketLimiter(config)
  _limiters.set(retailerId, limiter)
  return limiter
}

/**
 * Create a standalone rate limiter (not registered as a singleton).
 * Useful for tests.
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  return new TokenBucketLimiter(config)
}

/** Reset all rate limiters (useful in tests) */
export function resetAllLimiters(): void {
  _limiters.clear()
}

// ── Helper ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
