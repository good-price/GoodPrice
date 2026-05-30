/**
 * Exponential backoff retry wrapper
 *
 * Used for:
 *   - PA-API requests (transient network failures)
 *   - MercadoLibre API requests
 *   - Any external API call that may fail transiently
 *
 * Does NOT retry on:
 *   - 4xx errors (auth, bad request) — retrying won't help
 *   - Aborted requests — caller should handle AbortSignal separately
 *
 * Usage:
 *   const result = await withRetry(
 *     () => fetch('https://api.example.com/...'),
 *     { maxAttempts: 3, initialDelayMs: 1000 }
 *   )
 */

import { logger } from './logger'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number
  /** Delay before first retry in ms. Default: 1000 */
  initialDelayMs?: number
  /** Multiplier applied after each failed attempt. Default: 2 */
  backoffMultiplier?: number
  /** Maximum delay cap in ms. Default: 30000 */
  maxDelayMs?: number
  /** If true, add ±20% jitter to delay. Default: true */
  jitter?: boolean
  /** Called before each retry (for logging / metrics) */
  onRetry?: (attempt: number, maxAttempts: number, error: Error, delayMs: number) => void
  /** If true, do not retry this error (e.g. 401, 404). Default: false */
  shouldRetry?: (error: Error) => boolean
}

// ── Retry implementation ───────────────────────────────────────────────────────

/**
 * Execute `fn` with exponential backoff retries.
 * Throws the last error if all attempts fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const {
    maxAttempts      = 3,
    initialDelayMs   = 1000,
    backoffMultiplier = 2,
    maxDelayMs       = 30_000,
    jitter           = true,
    onRetry,
    shouldRetry,
  } = options ?? {}

  let lastError: Error = new Error('Unknown error')
  let delayMs = initialDelayMs

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      // Don't retry if caller says so
      if (shouldRetry && !shouldRetry(lastError)) {
        throw lastError
      }

      // Don't retry on final attempt
      if (attempt === maxAttempts) break

      // Compute jittered delay
      const actualDelay = jitter
        ? Math.min(delayMs * (0.8 + Math.random() * 0.4), maxDelayMs)
        : Math.min(delayMs, maxDelayMs)

      onRetry?.(attempt, maxAttempts, lastError, actualDelay)

      logger.warn('Retrying after error', {
        attempt,
        maxAttempts,
        delayMs: Math.round(actualDelay),
        error: lastError.message.slice(0, 120),
      })

      await sleep(actualDelay)
      delayMs *= backoffMultiplier
    }
  }

  throw lastError
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Returns a `shouldRetry` predicate that skips retry for HTTP client errors.
 * Parses the error message for status codes (e.g. "HTTP 401", "HTTP 404").
 */
export function skipClientErrors(error: Error): boolean {
  const match = error.message.match(/HTTP (\d{3})/)
  if (!match) return true   // unknown error → do retry
  const status = parseInt(match[1], 10)
  return status >= 500      // only retry server errors
}
