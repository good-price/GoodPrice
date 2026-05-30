/**
 * GET /api/catalog/integrity
 *
 * Returns a full catalog integrity report including:
 *   - publicProducts, hiddenProducts, quarantinedProducts
 *   - staleImages, invalidAsins, duplicatedAsins, duplicatedIds
 *   - integrityScore (0–100), grade, scoreBreakdown
 *   - issues list (errors + warnings)
 *   - per-category breakdown
 *   - lastAuditAt, auditAgeDays
 *
 * Optional query params:
 *   ?save=1   → persists a snapshot to data/catalog/integrity-snapshot.json
 *              (used for trend tracking in the admin dashboard)
 *
 * Auth: protected by AUDIT_SECRET env var (same secret as audit endpoints).
 * If AUDIT_SECRET is not set, the endpoint is open (dev convenience).
 */

import { NextRequest, NextResponse } from 'next/server'
import { runCatalogIntegrity, saveIntegritySnapshot } from '@/lib/catalog/integrity'
import { isAdminRequest } from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = runCatalogIntegrity()

    // Optionally persist snapshot for trend tracking
    const shouldSave = req.nextUrl.searchParams.get('save') === '1'
    if (shouldSave) {
      saveIntegritySnapshot(report)
    }

    return NextResponse.json(
      {
        ok: true,
        // ── Summary ─────────────────────────────────────────────────────────
        integrityScore:       report.score,
        grade:                report.grade,
        generatedAt:          report.generatedAt,
        // ── Counts ──────────────────────────────────────────────────────────
        publicProducts:       report.publicProducts,
        hiddenProducts:       report.hiddenProducts,
        quarantinedProducts:  report.quarantinedProducts,
        staleImages:          report.staleImages,
        invalidAsins:         report.invalidAsins,
        duplicatedAsins:      report.duplicatedAsins,
        duplicatedIds:        report.duplicatedIds,
        orphanProducts:       report.orphanProducts,
        // ── Audit ───────────────────────────────────────────────────────────
        lastAuditAt:          report.lastAuditAt,
        auditAgeDays:         report.auditAgeDays,
        // ── Score breakdown ──────────────────────────────────────────────────
        scoreBreakdown:       report.scoreBreakdown,
        // ── Issues + categories ──────────────────────────────────────────────
        issues:               report.issues,
        byCategory:           report.byCategory,
      },
      {
        status: report.issues.some(i => i.severity === 'error') ? 207 : 200,
        headers: {
          'X-Integrity-Score': String(report.score),
          'X-Integrity-Grade': report.grade,
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (err) {
    console.error('[catalog/integrity] Error running integrity check:', err)
    return NextResponse.json(
      { ok: false, error: 'Internal error running integrity check' },
      { status: 500 }
    )
  }
}
