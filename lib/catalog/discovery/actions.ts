'use server'

/**
 * lib/catalog/discovery/actions.ts
 *
 * Server Actions for manual Amazon Discovery — Sprint 4B.
 *
 * runDiscoveryAction:
 *   Reads the target category from the form, runs the full Amazon Discovery
 *   pipeline, then redirects to the Catalog Center with a status query param.
 *
 * SERVER-ONLY. `'use server'` directive marks all exports as Server Actions.
 */

import { redirect } from 'next/navigation'

import { runAmazonDiscovery } from './amazon/pipeline'

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Manual trigger for Amazon Discovery on a specific category.
 *
 * Redirects to /admin/catalog?discovery=success on success (≥1 saved)
 * or ?discovery=failed on failure (0 saved or invalid input).
 *
 * redirect() is called outside try/catch — Next.js requires this.
 */
export async function runDiscoveryAction(formData: FormData): Promise<void> {
  let status: 'success' | 'failed' = 'success'

  try {
    const raw = formData.get('category')
    if (!raw || typeof raw !== 'string' || raw.trim() === '') {
      status = 'failed'
    } else {
      const result = await runAmazonDiscovery(raw.trim())
      if (result.saved === 0 && result.errors.length > 0) status = 'failed'
    }
  } catch {
    status = 'failed'
  }

  redirect(`/admin/catalog?discovery=${status}`)
}
