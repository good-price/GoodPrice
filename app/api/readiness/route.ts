/**
 * GET /api/readiness
 *
 * Post-deploy readiness probe for GOODPRICE.
 *
 * Returns the deployment's runtime configuration state without exposing
 * any secret values. Use this endpoint to verify a fresh Vercel deployment
 * has all environment variables correctly set before sending it traffic.
 *
 * Response codes:
 *   200 — all required variables set, catalog present, health ok/degraded
 *   503 — missing required config OR system health is critical
 *
 * No authentication required — this only reveals whether vars are SET,
 * never their actual values.
 *
 * Used by:
 *   - Vercel deploy hooks / post-deploy CI checks
 *   - External uptime monitors (UptimeRobot, BetterStack, etc.)
 *   - scripts/launch-check.ts (remote validation)
 */

import { NextResponse } from 'next/server'
import { runHealthCheck } from '@/lib/ops/health'
import { getRawProducts } from '@/data/catalog'
import { countStaleImages } from '@/lib/paapi/image-sync'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ── Types ──────────────────────────────────────────────────────────────────────

interface EnvCheck {
  name:      string
  set:       boolean
  required:  boolean
  note?:     string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isPlaceholder(val: string | undefined): boolean {
  if (!val) return true
  const lower = val.toLowerCase()
  return (
    lower.startsWith('your-') ||
    lower.includes('-here') ||
    lower.includes('example') ||
    lower.includes('placeholder') ||
    lower.includes('changeme') ||
    // default fallback from lib/seo/meta.ts — means NEXT_PUBLIC_SITE_URL was never configured
    val === 'https://goodprice.vercel.app'
  )
}

function envCheck(name: string, required: boolean, note?: string): EnvCheck {
  return {
    name,
    set:      !isPlaceholder(process.env[name]),
    required,
    note,
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function GET() {
  // ── Environment variable audit ─────────────────────────────────────────────
  const envChecks: EnvCheck[] = [
    envCheck(
      'NEXT_PUBLIC_SITE_URL', true,
      'Custom domain — required for accurate canonical URLs and sitemap',
    ),
    envCheck(
      'CRON_SECRET', true,
      'Vercel Cron sends this as Authorization: Bearer {CRON_SECRET}',
    ),
    envCheck(
      'ADMIN_PASSWORD', true,
      '/admin is open to the internet without this',
    ),
    envCheck(
      'RESEND_API_KEY', false,
      'Required to deliver price-alert emails',
    ),
    envCheck(
      'RESEND_FROM_EMAIL', false,
      'Verified sender address in Resend',
    ),
    envCheck(
      'PAAPI_ACCESS_KEY', false,
      'Amazon PA-API — required for image sync',
    ),
    envCheck(
      'PAAPI_SECRET_KEY', false,
      'Amazon PA-API — required for image sync',
    ),
    envCheck(
      'AUDIT_SECRET', false,
      'Optional secondary secret for manually triggering audit/paapi endpoints',
    ),
  ]

  const missingRequired = envChecks.filter(e => e.required && !e.set)

  // ── Catalog ────────────────────────────────────────────────────────────────
  let catalogCount  = 0
  let catalogOk     = false
  let staleImages   = 0
  let freshImages   = 0
  let totalImages   = 0

  try {
    const products = getRawProducts()
    catalogCount   = products.length
    catalogOk      = catalogCount > 0
  } catch { /* catalogOk stays false */ }

  try {
    const imgStats   = countStaleImages()
    staleImages      = imgStats.stale
    freshImages      = imgStats.fresh
    totalImages      = imgStats.total
  } catch { /* non-fatal */ }

  // ── System health ─────────────────────────────────────────────────────────
  const health = runHealthCheck()

  // ── Overall readiness ────────────────────────────────────────────────────
  const ready = missingRequired.length === 0 && catalogOk

  const httpStatus =
    !ready              ? 503 :
    health.status === 'critical' ? 503 :
    200

  return NextResponse.json(
    {
      ready,
      checkedAt:   new Date().toISOString(),
      environment: process.env.NODE_ENV ?? 'unknown',
      siteUrl:     process.env.NEXT_PUBLIC_SITE_URL ?? null,

      env: {
        checks:          envChecks,
        missingRequired: missingRequired.map(e => e.name),
        allRequiredSet:  missingRequired.length === 0,
      },

      catalog: {
        ok:           catalogOk,
        productCount: catalogCount,
        images: {
          total:  totalImages,
          fresh:  freshImages,
          stale:  staleImages,
          stalePct: totalImages > 0
            ? Math.round((staleImages / totalImages) * 100)
            : 0,
        },
      },

      health: {
        status:     health.status,
        subsystems: health.subsystems.map(s => ({
          name:    s.name,
          status:  s.status,
          message: s.message,
        })),
      },
    },
    {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store',
        'X-Readiness':   ready ? 'ready' : 'not-ready',
      },
    },
  )
}
