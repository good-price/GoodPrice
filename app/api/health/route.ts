/**
 * GET /api/health
 *
 * Public system health check endpoint.
 * No authentication required — designed to be pinged by:
 *   - Vercel's built-in health check
 *   - UptimeRobot / Better Uptime / other external monitors
 *   - Admin dashboard (server component fetch)
 *   - CI/CD post-deploy validation
 *
 * Response:
 *   200  status: 'ok'       — all subsystems healthy
 *   200  status: 'degraded' — some subsystems need attention but platform is operational
 *   503  status: 'critical' — one or more critical failures, platform may be impaired
 *
 * Note: Returns 200 even for 'degraded' (platform is up, just has warnings).
 *       Returns 503 only for 'critical' (uptime monitors treat 503 as an alert).
 *
 * Response body: SystemHealth (see lib/ops/health.ts)
 *
 * Performance: <10ms — reads local files only, no network calls.
 */

import { NextResponse } from 'next/server'
import { runHealthCheck } from '@/lib/ops/health'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'

export function GET() {
  try {
    const health = runHealthCheck()

    const statusCode = health.status === 'critical' ? 503 : 200

    return NextResponse.json(health, {
      status: statusCode,
      headers: {
        // Uptime monitors can cache this; 30s is a reasonable TTL
        'Cache-Control': 'no-store, max-age=0',
        // Make status readable from headers without parsing JSON
        'X-Health-Status': health.status,
      },
    })
  } catch (err) {
    // Health check itself crashed — this is a critical failure
    return NextResponse.json(
      {
        status: 'critical',
        checkedAt: new Date().toISOString(),
        subsystems: [],
        error: err instanceof Error ? err.message : 'Health check failed',
        meta: { environment: process.env.NODE_ENV ?? 'unknown', nodeVersion: process.version },
      },
      { status: 503, headers: { 'X-Health-Status': 'critical' } },
    )
  }
}
