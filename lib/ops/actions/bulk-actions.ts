/**
 * lib/ops/actions/bulk-actions.ts
 *
 * Bulk operations on multiple products simultaneously.
 * Executes the same action on a list of product IDs.
 * Reports per-product success/failure.
 *
 * SERVER-ONLY.
 */

import { executeProductAction } from './product-actions'
import type { ProductAction, BulkActionResult } from './types'

const MAX_BULK = 100

/**
 * Executes the same action on a list of product IDs.
 * Runs sequentially to avoid race conditions on shared files.
 */
export async function executeBulkAction(
  productIds: string[],
  action:     ProductAction,
  operator:   string,
  reason:     string,
  options:    Record<string, unknown> = {},
): Promise<BulkActionResult> {
  const ids   = productIds.slice(0, MAX_BULK)
  const total = ids.length

  let succeeded = 0
  let failed    = 0
  const results = []

  for (const productId of ids) {
    const result = await executeProductAction(productId, action, operator, reason, options)
    results.push(result)
    if (result.ok) succeeded++
    else failed++
  }

  return {
    ok:        failed === 0,
    action,
    total,
    succeeded,
    failed,
    results,
  }
}
