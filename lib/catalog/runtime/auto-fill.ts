/**
 * lib/catalog/runtime/auto-fill.ts
 *
 * Catalog Auto Fill Orchestrator — Sprint 3G / 3H.
 *
 * resolveCategoryDeficit(targetCategory?):
 *   Runs the full discovery + admission pipeline for one category,
 *   repeating until the deficit reaches 0 or no further progress can
 *   be made. Accepts an optional targetCategory; falls back to the
 *   highest-deficit category when omitted.
 *
 * resolveCatalogDeficits():
 *   Iterates over ALL deficit categories (up to MAX_CATEGORY_ITERATIONS),
 *   calling resolveCategoryDeficit per category, with pool refresh before
 *   each pass if the candidate pool is low or empty. Writes one multi-
 *   category OPS log on completion.
 *
 * triggerAutoFill():
 *   Thin wrapper for fire-and-forget invocation from Server Actions.
 *   Calls resolveCatalogDeficits(). Swallows all errors. Never throws.
 *
 * Import chain (acyclic):
 *   auto-fill.ts → runner.ts → execution-actions.ts
 *   auto-fill.ts → execution-actions.ts (direct reads)
 *   auto-fill.ts → pool-health / refresh (discovery)
 *
 * SERVER-ONLY. Never import in Client Components.
 */

import { appendLog }               from '@/lib/ops/logs'
import type { OpsLog }             from '@/lib/ops/logs'
import { computeCategoryDeficits } from './category-config'
import { readCatalogExecution, saveCatalogExecution } from './execution-actions'
import { runCatalogDiscovery }     from '@/lib/catalog/discovery/runner'
import { needsPoolRefresh }        from '@/lib/catalog/discovery/pool-health'
import { refreshCategoryPool }     from '@/lib/catalog/discovery/refresh'

// refreshCategoryPool is now async (Sprint 4A: may trigger Amazon Discovery)

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum discovery+admission iterations per single-category fill. */
export const MAX_DISCOVERY_ITERATIONS = 10

/** Maximum candidates processed per discovery run (see runner.ts). */
export const MAX_DISCOVERY_BATCH = 100

/** Maximum deficit categories processed per multi-category fill. */
export const MAX_CATEGORY_ITERATIONS = 20

// ── Result types ──────────────────────────────────────────────────────────────

export interface ResolutionResult {
  status:           'completed' | 'no_deficit' | 'no_progress' | 'already_running' | 'error'
  category?:        string
  minimum?:         number
  current?:         number
  initialDeficit?:  number
  found?:           number
  validated?:       number
  admitted?:        number
  remainingDeficit?: number
  iterations?:      number
  pipelineId?:      string
}

export interface AutoFillResult {
  status:              'completed' | 'partial' | 'no_deficit' | 'already_running' | 'error'
  categoriesProcessed: number
  categoriesResolved:  number
  totalAdmitted:       number
  remainingDeficits:   number
  refreshedPools:      string[]
  warnings:            string[]
  pipelineId:          string
}

// ── Single-category fill ──────────────────────────────────────────────────────

/**
 * Resolves one category's deficit by running discovery + admission in a
 * loop until the deficit reaches 0 or no further progress is possible.
 *
 * When targetCategory is provided, targets that specific category.
 * Otherwise targets the highest-deficit category.
 *
 * Writes a comprehensive OPS log on completion.
 * Never throws.
 */
export function resolveCategoryDeficit(targetCategory?: string): ResolutionResult {
  try {
    // ── Pre-flight ───────────────────────────────────────────────────────────
    const lockState = readCatalogExecution()
    if (lockState.isRunning) {
      return { status: 'already_running', pipelineId: lockState.pipelineId ?? undefined }
    }

    const initialDeficits = computeCategoryDeficits()
    const topDeficit      = targetCategory
      ? initialDeficits.find(d => d.category === targetCategory && d.deficit > 0)
      : initialDeficits.find(d => d.deficit > 0)
    if (!topDeficit) return { status: 'no_deficit' }

    const pipelineId     = `cf-${Date.now()}`
    const startedAt      = new Date().toISOString()
    const category       = topDeficit.category
    const minimum        = topDeficit.minimum
    const current        = topDeficit.current
    const initialDeficit = topDeficit.deficit

    let totalFound     = 0
    let totalValidated = 0
    let totalAdmitted  = 0
    let iterations     = 0

    // ── Iteration loop ───────────────────────────────────────────────────────
    for (let i = 0; i < MAX_DISCOVERY_ITERATIONS; i++) {
      const freshDeficits   = computeCategoryDeficits()
      const freshTopDeficit = freshDeficits.find(d => d.category === category)
      const remainingNow    = freshTopDeficit?.deficit ?? 0
      if (remainingNow === 0) break

      iterations++

      const result = runCatalogDiscovery(targetCategory)

      if (result.status === 'already_running') break
      if (result.status === 'no_deficit')      break
      if (result.status === 'error')           break

      totalFound     += result.found     ?? 0
      totalValidated += result.validated ?? 0
      totalAdmitted  += result.admitted  ?? 0

      // Update execution state with running totals
      const afterState    = readCatalogExecution()
      const afterDeficits = computeCategoryDeficits()
      const afterRemaining = afterDeficits.find(d => d.category === category)?.deficit ?? 0

      saveCatalogExecution({
        ...afterState,
        iterations,
        remainingDeficit: afterRemaining,
      })

      if ((result.admitted ?? 0) === 0) break
    }

    // ── Final state ──────────────────────────────────────────────────────────
    const finalDeficits    = computeCategoryDeficits()
    const remainingDeficit = finalDeficits.find(d => d.category === category)?.deficit ?? 0

    const finalExecState = readCatalogExecution()
    const completedAt    = new Date().toISOString()
    saveCatalogExecution({
      ...finalExecState,
      iterations,
      remainingDeficit,
      completedAt: finalExecState.completedAt ?? completedAt,
    })

    // ── OPS log ──────────────────────────────────────────────────────────────
    const logStatus =
      remainingDeficit === 0 ? 'success'
      : totalAdmitted  > 0  ? 'partial'
      :                       'failed'

    const admittedAsins = (() => {
      try {
        const st = readCatalogExecution()
        return st.lastAdmittedAsin ? [st.lastAdmittedAsin] : []
      } catch { return [] }
    })()

    const log: OpsLog = {
      id:          pipelineId,
      jobType:     'catalog-fill',
      trigger:     'manual',
      startedAt,
      completedAt,
      durationMs:  new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      status:      logStatus,
      summary:     `Catalog Fill completado.`,
      notes: [
        `category: ${category}`,
        `minimum: ${minimum}`,
        `current: ${current}`,
        `initialDeficit: ${initialDeficit}`,
        `found: ${totalFound}`,
        `validated: ${totalValidated}`,
        `admitted: ${totalAdmitted}`,
        `remainingDeficit: ${remainingDeficit}`,
        `iterations: ${iterations}`,
        `pipelineId: ${pipelineId}`,
      ].join(', '),
      actions: {
        removed:    [],
        repaired:   [],
        suppressed: [],
        recovered:  admittedAsins,
        flagged:    [],
      },
      errors:   [],
      warnings: remainingDeficit > 0
        ? [`Déficit no resuelto: ${remainingDeficit} productos faltantes en ${category}.`]
        : [],
    }
    appendLog(log)

    const resultStatus: ResolutionResult['status'] =
      remainingDeficit === 0 ? 'completed'
      : totalAdmitted   > 0 ? 'completed'  // partial but made progress
      :                       'no_progress'

    return {
      status:          resultStatus,
      category,
      minimum,
      current,
      initialDeficit,
      found:           totalFound,
      validated:       totalValidated,
      admitted:        totalAdmitted,
      remainingDeficit,
      iterations,
      pipelineId,
    }

  } catch {
    return { status: 'error' }
  }
}

// ── Multi-category fill ───────────────────────────────────────────────────────

/**
 * Iterates over ALL deficit categories (up to MAX_CATEGORY_ITERATIONS),
 * calling resolveCategoryDeficit() for each. Before each category, refreshes
 * the candidate pool if it is empty or low to prune already-admitted ASINs.
 *
 * Updates CatalogExecutionState with multi-category tracking fields
 * (currentCategory, categoriesProcessed, categoriesResolved, refreshedPools,
 * warnings) after each category.
 *
 * Writes one consolidated OPS log on completion.
 * Never throws.
 */
export async function resolveCatalogDeficits(): Promise<AutoFillResult> {
  const pipelineId = `mcf-${Date.now()}`
  const startedAt  = new Date().toISOString()

  try {
    // ── Pre-flight ───────────────────────────────────────────────────────────
    const lockState = readCatalogExecution()
    if (lockState.isRunning) {
      return {
        status:              'already_running',
        categoriesProcessed: 0,
        categoriesResolved:  0,
        totalAdmitted:       0,
        remainingDeficits:   0,
        refreshedPools:      [],
        warnings:            [],
        pipelineId,
      }
    }

    const allDeficits = computeCategoryDeficits().filter(d => d.deficit > 0)
    if (allDeficits.length === 0) {
      return {
        status:              'no_deficit',
        categoriesProcessed: 0,
        categoriesResolved:  0,
        totalAdmitted:       0,
        remainingDeficits:   0,
        refreshedPools:      [],
        warnings:            [],
        pipelineId,
      }
    }

    // ── Category iteration loop ──────────────────────────────────────────────
    const limit             = Math.min(allDeficits.length, MAX_CATEGORY_ITERATIONS)
    let totalAdmitted       = 0
    let categoriesProcessed = 0
    let categoriesResolved  = 0
    const refreshedPools:   string[] = []
    const warnings:         string[] = []
    const allAdmittedAsins: string[] = []
    const errorCategories:  string[] = []

    for (let i = 0; i < limit; i++) {
      const deficit   = allDeficits[i]!
      const category  = deficit.category

      categoriesProcessed++

      // Update execution state: announce current category
      try {
        const stateNow = readCatalogExecution()
        saveCatalogExecution({
          ...stateNow,
          currentCategory:     category,
          categoriesProcessed,
          categoriesResolved,
          refreshedPools,
          warnings,
        })
      } catch { /* best-effort */ }

      // Pool refresh: prune + replenish via Amazon Discovery if needed
      if (needsPoolRefresh(category)) {
        try {
          await refreshCategoryPool(category)
          if (!refreshedPools.includes(category)) refreshedPools.push(category)
        } catch {
          warnings.push(`Pool refresh falló para ${category}`)
        }
      }

      // Single-category fill (handles its own lock + iterations)
      const result = resolveCategoryDeficit(category)

      if (result.status === 'already_running') break

      if (result.status === 'error') {
        errorCategories.push(category)
        warnings.push(`Error en categoría ${category}`)
        continue
      }

      const admitted = result.admitted ?? 0
      totalAdmitted += admitted
      if (admitted > 0) categoriesResolved++

      // Collect last admitted ASIN for the OPS log recovered list
      try {
        const stateAfter = readCatalogExecution()
        if (stateAfter.lastAdmittedAsin) allAdmittedAsins.push(stateAfter.lastAdmittedAsin)
      } catch { /* best-effort */ }

      // Update multi-category fields after this category completes
      try {
        const stateNow = readCatalogExecution()
        saveCatalogExecution({
          ...stateNow,
          categoriesProcessed,
          categoriesResolved,
          refreshedPools,
          warnings,
        })
      } catch { /* best-effort */ }
    }

    // ── Final state update ───────────────────────────────────────────────────
    const totalRemainingDeficit = computeCategoryDeficits()
      .reduce((s, d) => s + d.deficit, 0)

    try {
      const finalState = readCatalogExecution()
      saveCatalogExecution({
        ...finalState,
        currentCategory:     null,
        categoriesProcessed,
        categoriesResolved,
        refreshedPools,
        warnings,
        remainingDeficit:    totalRemainingDeficit,
      })
    } catch { /* best-effort */ }

    // ── OPS log ──────────────────────────────────────────────────────────────
    const completedAt = new Date().toISOString()
    const logStatus   =
      totalAdmitted > 0 && totalRemainingDeficit === 0 ? 'success'
      : totalAdmitted > 0                              ? 'partial'
      :                                                  'failed'

    const log: OpsLog = {
      id:          pipelineId,
      jobType:     'catalog-fill',
      trigger:     'manual',
      startedAt,
      completedAt,
      durationMs:  new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      status:      logStatus,
      summary: `Multi-Category Fill: ${categoriesProcessed} categorías, ${totalAdmitted} productos admitidos.`,
      notes: [
        `categoriesProcessed: ${categoriesProcessed}`,
        `categoriesResolved: ${categoriesResolved}`,
        `totalAdmitted: ${totalAdmitted}`,
        `remainingDeficits: ${totalRemainingDeficit}`,
        `refreshedPools: ${refreshedPools.join(', ') || 'ninguno'}`,
        `warnings: ${warnings.length}`,
        `pipelineId: ${pipelineId}`,
      ].join(', '),
      actions: {
        removed:    [],
        repaired:   [],
        suppressed: [],
        recovered:  allAdmittedAsins,
        flagged:    warnings,
      },
      errors:   errorCategories,
      warnings,
    }
    appendLog(log)

    const resultStatus: AutoFillResult['status'] =
      totalAdmitted > 0 && totalRemainingDeficit === 0 ? 'completed'
      : totalAdmitted > 0                              ? 'partial'
      : errorCategories.length > 0                     ? 'error'
      :                                                  'no_deficit'

    return {
      status:              resultStatus,
      categoriesProcessed,
      categoriesResolved,
      totalAdmitted,
      remainingDeficits:   totalRemainingDeficit,
      refreshedPools,
      warnings,
      pipelineId,
    }

  } catch {
    return {
      status:              'error',
      categoriesProcessed: 0,
      categoriesResolved:  0,
      totalAdmitted:       0,
      remainingDeficits:   0,
      refreshedPools:      [],
      warnings:            [],
      pipelineId,
    }
  }
}

// ── Fire-and-forget trigger ───────────────────────────────────────────────────

/**
 * Fire-and-forget wrapper for resolveCatalogDeficits().
 *
 * Designed for Server Actions that must not block the response.
 * Swallows all errors. Never throws. Never returns a meaningful value.
 * resolveCatalogDeficits() is async (may trigger Amazon Discovery), so this
 * function uses void to detach the promise intentionally.
 */
export function triggerAutoFill(): void {
  void resolveCatalogDeficits().catch(() => {
    // Intentionally swallowed
  })
}
