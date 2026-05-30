/**
 * GET /api/paapi/status
 *
 * Returns PA-API integration status:
 *   - Whether credentials are configured
 *   - Cache statistics
 *   - Last sync log (if any)
 *   - Image health (stale vs fresh counts)
 *
 * No auth required — safe to call from the admin dashboard JS-free.
 * Does not expose credentials.
 *
 * Response: PaapiStatusResponse (see below)
 */

import { NextResponse } from 'next/server'
import { getPaapiClient } from '@/lib/paapi/client'
import { getCacheStats } from '@/lib/paapi/cache'
import { getLastSyncLog, countStaleImages } from '@/lib/paapi/image-sync'

export const dynamic = 'force-dynamic'

export async function GET() {
  const client = getPaapiClient()
  const cacheStats = getCacheStats()
  const lastSync = getLastSyncLog()
  const imageHealth = countStaleImages()

  return NextResponse.json({
    configured: client.isConfigured,
    partnerTag: process.env.PAAPI_PARTNER_TAG ?? 'pulseprice-20',
    marketplace: process.env.PAAPI_MARKETPLACE ?? 'www.amazon.com',
    cache: cacheStats,
    imageHealth,
    lastSync: lastSync
      ? {
          runId:        lastSync.runId,
          startedAt:    lastSync.startedAt,
          completedAt:  lastSync.completedAt,
          durationMs:   lastSync.durationMs,
          totalTargets: lastSync.totalTargets,
          updated:      lastSync.updated,
          fromCache:    lastSync.fromCache,
          unchanged:    lastSync.unchanged,
          noImage:      lastSync.noImage,
          errors:       lastSync.errors,
        }
      : null,
  })
}
