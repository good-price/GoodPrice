import { NextResponse } from 'next/server'
import { getCatalogStats } from '@/data/catalog'
import { getValidationCacheSize } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

/**
 * GET /api/catalog/status
 * Returns catalog health stats. Useful for monitoring and future admin dashboard.
 */
export async function GET() {
  const stats = getCatalogStats()

  return NextResponse.json({
    ok: true,
    stats: {
      ...stats,
      validationCacheSize: getValidationCacheSize(),
    },
  })
}
