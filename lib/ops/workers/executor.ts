/**
 * lib/ops/workers/executor.ts
 *
 * Async execution utilities for OPS V3 workers.
 *
 * runWithTimeout():
 *   Races a worker promise against a deadline. If the deadline fires first, the
 *   result is marked as timed-out — the underlying async work is NOT cancelled
 *   (Node.js has no native Promise cancellation). The pipeline continues with
 *   the next stage regardless.
 *
 * runBatched():
 *   Runs an async function over a list of items with bounded concurrency and
 *   a configurable inter-batch delay. Used by the link-audit and colombia-audit
 *   workers to throttle Amazon HTTP requests.
 *
 * SERVER-ONLY.
 */

// ── Timeout runner ────────────────────────────────────────────────────────────

export type TimeoutResult<T> =
  | { ok: true;  value: T }
  | { ok: false; error: string; timedOut: boolean }

/**
 * Races `fn()` against a timeout.
 *
 * - If `fn()` resolves first  → `{ ok: true, value }`
 * - If `fn()` rejects first   → `{ ok: false, error, timedOut: false }`
 * - If timeout fires first     → `{ ok: false, error, timedOut: true }`
 *
 * Never throws. The underlying Promise continues to run after a timeout
 * (no Node.js process cancellation — unavoidable without AbortController).
 */
export function runWithTimeout<T>(
  fn:        () => Promise<T>,
  timeoutMs: number,
): Promise<TimeoutResult<T>> {
  return new Promise<TimeoutResult<T>>((resolve) => {
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({
          ok:       false,
          error:    `Stage timed out after ${timeoutMs}ms — pipeline continues`,
          timedOut: true,
        })
      }
    }, timeoutMs)

    fn().then(
      (value) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve({ ok: true, value })
        }
      },
      (err: unknown) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve({
            ok:       false,
            error:    err instanceof Error ? err.message : String(err),
            timedOut: false,
          })
        }
      },
    )
  })
}

// ── Batched concurrency runner ────────────────────────────────────────────────

/**
 * Runs `fn` over `items` with at most `concurrency` simultaneous executions.
 * Waits `delayMs` between batches (not between individual items).
 * Never throws — errors from individual items are returned as rejected values
 * (caller should handle via try/catch inside `fn`).
 */
export async function runBatched<T, R>(
  items:       T[],
  concurrency: number,
  delayMs:     number,
  fn:          (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch       = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
    if (i + concurrency < items.length && delayMs > 0) {
      await new Promise<void>(r => setTimeout(r, delayMs))
    }
  }
  return results
}
