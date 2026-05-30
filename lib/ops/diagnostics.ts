/**
 * lib/ops/diagnostics.ts
 *
 * Runs low-level checks to detect system inconsistencies, stale state,
 * dead queues, invalid cache, and other operational problems.
 *
 * Unlike alerts (which flag conditions requiring action NOW),
 * diagnostics surface structural issues that degrade quality over time.
 *
 * SERVER-ONLY.
 */

import { existsSync }                from 'fs'
import { join }                       from 'path'
import {
  loadReport as loadTruthReport,
  loadAllResults,
  loadSuppressedStore,
  getOverrideCount,
  loadOverrideStore,
} from '@/lib/catalog/live-truth'
import { loadHealingReport }          from '@/lib/catalog/self-healing'
import { getAllProducts }              from '@/data/catalog'
import type { DiagnosticIssue }       from './types'

// ── Time helpers ──────────────────────────────────────────────────────────────

function ageMs(iso: string | null | undefined): number {
  if (!iso) return Infinity
  return Date.now() - new Date(iso).getTime()
}
const DAY  = 86_400_000
const WEEK = 7 * DAY

// ── Individual checks ─────────────────────────────────────────────────────────

function checkStaleReports(): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = []

  const truthReport   = loadTruthReport()
  const healingReport = loadHealingReport()

  if (!truthReport) {
    issues.push({
      severity:   'warning',
      subsystem:  'Live Truth',
      code:       'TRUTH_NEVER_RUN',
      description: 'No se ha ejecutado ninguna validación Live Truth.',
      suggestion: 'POST /api/catalog/live-truth/run { limit: 5 }',
    })
  } else if (ageMs(truthReport.generatedAt) > WEEK) {
    issues.push({
      severity:   'warning',
      subsystem:  'Live Truth',
      code:       'TRUTH_REPORT_STALE',
      description: `El reporte de validación tiene más de 7 días (${Math.round(ageMs(truthReport.generatedAt) / DAY)}d).`,
      suggestion: 'Ejecutar ciclo de validación: POST /api/catalog/live-truth/run',
    })
  }

  if (!healingReport) {
    issues.push({
      severity:   'info',
      subsystem:  'Self-Healing',
      code:       'HEALING_NEVER_RUN',
      description: 'El sistema de auto-reparación no ha corrido aún.',
      suggestion: 'POST /api/catalog/self-healing/run',
    })
  } else if (ageMs(healingReport.lastCycleAt ?? undefined) > WEEK) {
    issues.push({
      severity:   'info',
      subsystem:  'Self-Healing',
      code:       'HEALING_REPORT_STALE',
      description: 'El último ciclo de auto-reparación tiene más de 7 días.',
      suggestion: 'POST /api/catalog/self-healing/run',
    })
  }

  return issues
}

function checkInconsistentCounts(): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = []

  const results       = loadAllResults()
  const resultCount   = Object.keys(results).length
  const truthReport   = loadTruthReport()

  if (truthReport && resultCount > 0) {
    const drift = Math.abs(resultCount - truthReport.totalChecked)
    if (drift > 10) {
      issues.push({
        severity:   'info',
        subsystem:  'Live Truth',
        code:       'RESULT_COUNT_DRIFT',
        description: `Desfase entre resultados individuales (${resultCount}) y totalChecked del reporte (${truthReport.totalChecked}).`,
        suggestion: 'Normal si el catálogo cambió entre runs. Ejecutar nueva validación para sincronizar.',
      })
    }
  }

  return issues
}

function checkStaleSuppression(): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = []
  const store = loadSuppressedStore()

  // Check for very old suppressions (>30 days) — may indicate stuck products
  const stuckThreshold = 30 * DAY
  const stuck = Object.values(store.entries).filter(
    e => ageMs(e.suppressedAt) > stuckThreshold,
  )

  if (stuck.length > 0) {
    issues.push({
      severity:   'warning',
      subsystem:  'Self-Healing',
      code:       'STUCK_SUPPRESSION',
      description: `${stuck.length} productos llevan >30 días suprimidos sin recuperarse. Posible bucle de supresión.`,
      suggestion:  'Revisar manualmente los productos suprimidos y considerar quarantine permanente o eliminación del catálogo.',
    })
  }

  return issues
}

function checkStaleOverrides(): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = []
  const count = getOverrideCount()
  if (count === 0) return issues

  const store = loadOverrideStore()
  const staleThreshold = 14 * DAY
  const staleOverrides = Object.values(store.overrides).filter(
    o => ageMs(o.appliedAt) > staleThreshold,
  )

  if (staleOverrides.length > 0) {
    issues.push({
      severity:   'info',
      subsystem:  'Live Truth',
      code:       'STALE_OVERRIDES',
      description: `${staleOverrides.length} correcciones de metadatos tienen >14 días sin actualizar. Los datos de catálogo originales podrían haber cambiado de nuevo.`,
      suggestion:  'Re-ejecutar validación para los productos afectados y verificar si las correcciones siguen siendo necesarias.',
    })
  }

  return issues
}

function checkMissingDataDirs(): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = []
  const required = [
    { path: 'data/catalog',           label: 'Catálogo' },
    { path: 'data/audit',             label: 'Auditoría' },
    { path: 'data/catalog/live-truth', label: 'Live Truth' },
  ]

  for (const { path } of required) {
    if (!existsSync(join(process.cwd(), path))) {
      issues.push({
        severity:   'critical',
        subsystem:  'Infraestructura',
        code:       'MISSING_DIR',
        description: `Directorio de datos requerido no existe: ${path}`,
        suggestion:  `Crear directorio: mkdir -p ${path}`,
      })
    }
  }

  return issues
}

function checkCatalogCoverage(): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = []
  const results = loadAllResults()
  const total   = getAllProducts().filter(p => p.asin && p.id).length

  const checkedCount  = Object.keys(results).length
  const coveragePct   = total > 0 ? Math.round((checkedCount / total) * 100) : 0

  if (total > 0 && coveragePct < 30) {
    issues.push({
      severity:   'info',
      subsystem:  'Live Truth',
      code:       'LOW_TRUTH_COVERAGE',
      description: `Solo ${coveragePct}% del catálogo (${checkedCount}/${total}) tiene resultados de validación.`,
      suggestion:  'Ejecutar POST /api/catalog/live-truth/run con limit: 20 varias veces para aumentar cobertura.',
    })
  }

  return issues
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all diagnostic checks and return issues sorted critical → warning → info.
 */
export function runDiagnostics(): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [
    ...checkMissingDataDirs(),
    ...checkStaleReports(),
    ...checkInconsistentCounts(),
    ...checkStaleSuppression(),
    ...checkStaleOverrides(),
    ...checkCatalogCoverage(),
  ]

  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  issues.sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2))
  return issues
}
