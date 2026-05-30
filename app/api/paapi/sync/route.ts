/**
 * POST /api/paapi/sync
 *
 * Triggers a PA-API image sync for all stale catalog products (or a subset).
 * Can be called from the admin dashboard or scheduled via a Vercel Cron.
 *
 * Auth: same secret as audit endpoints.
 *   Header:  x-audit-secret: <AUDIT_SECRET>
 *   Header:  Authorization: Bearer <AUDIT_SECRET>
 *
 * Body (all optional):
 * {
 *   productIds?:    string[]   // limit to specific product IDs
 *   forceRefresh?:  boolean    // ignore cache and re-fetch from PA-API
 *   dryRun?:        boolean    // compute changes without writing files
 * }
 *
 * Response:
 * {
 *   runId:     string
 *   log:       PaapiSyncLog
 *   summary:   string   // human-readable one-liner
 * }
 *
 * Errors:
 *   401  — missing or invalid secret
 *   503  — PA-API credentials not configured
 *   500  — unexpected error
 *
 * ⚠ This endpoint modifies catalog .ts files on disk.
 *   After a sync, the Next.js server must be restarted (or the Vercel
 *   deployment must be redeployed) to reflect updated image URLs.
 *   In production, trigger a redeploy after sync via Vercel API.
 */

import { NextResponse } from 'next/server'
import { getPaapiClient } from '@/lib/paapi/client'
import { syncImages } from '@/lib/paapi/image-sync'
import { startJob, completeJob, failJob } from '@/lib/ops/job-logger'
import { jobLogger } from '@/lib/ops/logger'

const log = jobLogger('paapi-sync')

export const maxDuration = 300  // 5 min — enough for 200 products at 1 req/s

// ── Auth — accepts AUDIT_SECRET (manual) or CRON_SECRET (Vercel Cron) ────────

function isAuthorized(req: Request): boolean {
  const auditSecret = process.env.AUDIT_SECRET ?? process.env.CATALOG_VALIDATE_SECRET
  const cronSecret  = process.env.CRON_SECRET

  const header = req.headers.get('x-audit-secret')
    ?? req.headers.get('x-catalog-secret')
    ?? req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')

  if (auditSecret && header === auditSecret) return true
  if (cronSecret  && header === cronSecret)  return true
  if (!auditSecret && !cronSecret) return true  // dev/bootstrap
  return false
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = getPaapiClient()
  if (!client.isConfigured) {
    return NextResponse.json(
      {
        error: 'PA-API credentials not configured',
        help: 'Set PAAPI_ACCESS_KEY and PAAPI_SECRET_KEY in environment variables',
      },
      { status: 503 },
    )
  }

  let body: {
    productIds?: string[]
    forceRefresh?: boolean
    dryRun?: boolean
  } = {}

  try {
    body = await req.json().catch(() => ({}))
  } catch { /* empty body is fine */ }

  const jobRunId = startJob('paapi-sync', { forceRefresh: body.forceRefresh, dryRun: body.dryRun })

  try {
    log.info('Starting sync', { forceRefresh: body.forceRefresh, dryRun: body.dryRun })

    const syncLog = await syncImages({
      productIds:    body.productIds,
      forceRefresh:  body.forceRefresh ?? false,
      dryRun:        body.dryRun ?? false,
    })

    const summary =
      `Sync ${syncLog.runId}: ` +
      `${syncLog.updated} updated, ` +
      `${syncLog.fromCache} from cache, ` +
      `${syncLog.unchanged} unchanged, ` +
      `${syncLog.errors} errors — ` +
      `${Math.round(syncLog.durationMs / 1000)}s`

    completeJob('paapi-sync', jobRunId, {
      summary,
      status: syncLog.errors > 0 ? 'partial' : 'success',
      meta: {
        updated:   syncLog.updated,
        fromCache: syncLog.fromCache,
        errors:    syncLog.errors,
      },
    })

    return NextResponse.json({ runId: syncLog.runId, log: syncLog, summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('Sync failed', { error: message })
    failJob('paapi-sync', jobRunId, message)
    return NextResponse.json({ error: 'Sync failed', detail: message }, { status: 500 })
  }
}
