/**
 * POST /api/audit/run
 *
 * Triggers a full catalog audit run. Can be called manually from the admin
 * dashboard or scheduled via a Vercel Cron job.
 *
 * Auth: requires AUDIT_SECRET header (or CATALOG_VALIDATE_SECRET, same env var)
 *
 * Body (all optional):
 * {
 *   productIds?: string[]   // subset audit — only these IDs
 *   offlineMode?: boolean   // skip network checks (completeness + Colombia only)
 *   autoQuarantine?: boolean // auto-add F-grade products to quarantine
 *   concurrency?: number
 *   asinDelayMs?: number
 *   imageDelayMs?: number
 * }
 *
 * Response:
 * {
 *   runId: string
 *   summary: string
 *   report: CatalogAuditReport   // full report
 * }
 *
 * ⚠ This endpoint can take 5–15 minutes for a full 200-product audit.
 *   For Vercel hobby/pro, ensure the function timeout is sufficient (maxDuration).
 *   Use offlineMode=true for fast (~1s) completeness-only checks.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runAudit, saveReport, formatAuditSummary } from '@/lib/audit/report'
import { bulkQuarantine } from '@/lib/audit/quarantine'
import { extractTopIssues } from '@/lib/audit/scoring'
import { startJob, completeJob, failJob } from '@/lib/ops/job-logger'
import { jobLogger } from '@/lib/ops/logger'

const log = jobLogger('audit')

// Vercel max function duration — requires Pro plan for > 10s
export const maxDuration = 300

// Accepts: AUDIT_SECRET (admin manual), CRON_SECRET (Vercel Cron automatic)
function isAuthorized(req: NextRequest): boolean {
  const auditSecret = process.env.AUDIT_SECRET ?? process.env.CATALOG_VALIDATE_SECRET
  const cronSecret  = process.env.CRON_SECRET

  const provided =
    req.headers.get('x-audit-secret') ??
    req.headers.get('x-catalog-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  if (auditSecret && provided === auditSecret) return true
  if (cronSecret  && provided === cronSecret)  return true
  // No secrets configured → allow all (dev/bootstrap)
  if (!auditSecret && !cronSecret) return true
  return false
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: {
    productIds?:     string[]
    offlineMode?:    boolean
    autoQuarantine?: boolean
    concurrency?:    number
    asinDelayMs?:    number
    imageDelayMs?:   number
  } = {}

  try {
    body = await req.json()
  } catch {
    // Empty body is fine
  }

  const {
    productIds,
    offlineMode    = false,
    autoQuarantine = false,
    concurrency,
    asinDelayMs,
    imageDelayMs,
  } = body

  // ── Run audit ───────────────────────────────────────────────────────────────
  const runId = startJob('audit', { offlineMode, autoQuarantine })

  try {
    log.info('Starting audit', { offlineMode, autoQuarantine, productIds: productIds?.length })

    const report = await runAudit({
      productIds,
      offlineMode,
      concurrency,
      asinDelayMs,
      imageDelayMs,
    })

    // Save to disk (latest.json + run-specific file)
    saveReport(report)

    // Auto-quarantine F-grade products if requested
    let quarantineResult: { added: number; skipped: number } | null = null
    if (autoQuarantine) {
      const fGradeProducts = report.products.filter(p => p.grade === 'F')
      quarantineResult = bulkQuarantine(
        fGradeProducts.map(p => ({
          productId:      p.productId,
          asin:           p.asin,
          title:          p.title,
          category:       p.category,
          reason:         `Auto-quarantine: score ${p.score}/100 (F) — ${extractTopIssues(p)[0] ?? 'múltiples issues'}`,
          quarantinedBy:  'audit' as const,
          score:          p.score,
          issues:         extractTopIssues(p),
        }))
      )
    }

    const summary = formatAuditSummary(report)
    const hasGradeF = report.gradeDistribution.F > 0
    completeJob('audit', runId, {
      summary: `Score promedio: ${report.averageScore} · Críticos: ${report.criticalProducts.length} · F: ${report.gradeDistribution.F}`,
      status: hasGradeF ? 'partial' : 'success',
      meta: {
        totalProducts:   report.totalProducts,
        averageScore:    report.averageScore,
        criticalCount:   report.criticalProducts.length,
        gradeDistribution: report.gradeDistribution,
      },
    })

    return NextResponse.json({ runId: report.runId, summary, quarantineResult, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('Audit failed', { error: message })
    failJob('audit', runId, message)
    return NextResponse.json(
      { error: `Audit failed: ${message}` },
      { status: 500 }
    )
  }
}
