/**
 * lib/catalog/discovery/runner.ts
 *
 * Catalog Discovery + Admission Pipeline Runner — Sprint 3F/3G.
 *
 * Entry point: runCatalogDiscovery()
 *
 * Pipeline stages (written to catalog-execution.json at each transition):
 *   calculating  → search inputs determined, highest-deficit category selected
 *   discovering  → searchCatalogCandidates() + rankCatalogCandidates() complete
 *   validating   → validateCatalogCandidates() complete
 *   admitting    → admitCatalogCandidates() running; state updated per product
 *   completed    → final state persisted
 *
 * Guarantees:
 *   - Lock: only one concurrent run allowed (isRunning guard)
 *   - Atomic state writes at every stage transition and per-product during admission
 *   - No network calls, no new scraping
 *   - On error: writes 'failed' state and returns { status: 'error' }
 *   - Never throws
 *
 * Import direction (no circular deps):
 *   runner.ts  →  execution-actions.ts  ✓
 *   runner.ts  →  admission/             ✓
 *   execution-actions.ts  →  runner.ts  ✗ (never)
 *
 * SERVER-ONLY.
 */

import { getRuntimeProducts }      from '@/lib/catalog/runtime/reader'
import { computeCategoryDeficits } from '@/lib/catalog/runtime/category-config'
import {
  saveCatalogExecution,
  readCatalogExecution,
} from '@/lib/catalog/runtime/execution-actions'
import type { CatalogExecutionState } from '@/lib/catalog/runtime/execution'
import { admitCatalogCandidates }  from '@/lib/catalog/admission/admission'
import type { AdmissionContext }   from '@/lib/catalog/admission/types'

import { searchCatalogCandidates }   from './search'
import { rankCatalogCandidates }     from './ranking'
import { validateCatalogCandidates } from './validation'
import type { DiscoveryContext, DiscoveryResult } from './types'
import { rebuildRecommendations }    from '@/lib/catalog/recommendations/state'
import { generateAlerts }            from '@/lib/catalog/alerts/state'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum candidates to process per single discovery run. */
const MAX_DISCOVERY_BATCH = 100

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs one discovery + admission cycle.
 *
 * If targetCategory is provided, fills that specific category.
 * Otherwise targets the highest-deficit category.
 *
 * Stages: calculating → discovering → validating → admitting → completed
 *
 * Returns a DiscoveryResult. OPS log is written by the caller
 * (resolveCategoryDeficit) for multi-iteration summary.
 * Never throws.
 */
export function runCatalogDiscovery(targetCategory?: string): DiscoveryResult {
  // ── Lock check ─────────────────────────────────────────────────────────────
  const current = readCatalogExecution()
  if (current.isRunning) {
    return { status: 'already_running', pipelineId: current.pipelineId ?? undefined }
  }

  // ── Deficit selection ──────────────────────────────────────────────────────
  const deficits   = computeCategoryDeficits()
  const topDeficit = targetCategory
    ? deficits.find(d => d.category === targetCategory && d.deficit > 0)
    : deficits.find(d => d.deficit > 0)
  if (!topDeficit) return { status: 'no_deficit' }

  const pipelineId = `cf-${Date.now()}`
  const startedAt  = new Date().toISOString()

  const context: DiscoveryContext = {
    category:   topDeficit.category,
    deficit:    topDeficit.deficit,
    pipelineId,
  }

  const admissionCtx: AdmissionContext = {
    pipelineId,
    category: topDeficit.category,
    minimum:  topDeficit.minimum,
    current:  topDeficit.current,
    deficit:  topDeficit.deficit,
  }

  // ── Stage: calculating ─────────────────────────────────────────────────────
  // Spread current to preserve Sprint 3H multi-category fields
  // (currentCategory, categoriesProcessed, etc.) set by the outer orchestrator.
  let state: CatalogExecutionState = {
    ...current,
    isRunning:        true,
    category:         topDeficit.category,
    stage:            'calculating',
    deficit:          topDeficit.deficit,
    found:            0,
    validated:        0,
    admitted:         0,
    startedAt,
    completedAt:      null,
    pipelineId,
    currentBatch:     1,
    totalBatches:     1,
    currentCandidate: null,
    errors:           [],
    iterations:       current.iterations,
    remainingDeficit: topDeficit.deficit,
    lastAdmittedAsin: current.lastAdmittedAsin,
  }
  saveCatalogExecution(state)

  try {
    // ── Stage: discovering ───────────────────────────────────────────────────
    const raw    = searchCatalogCandidates(context)
    const ranked = rankCatalogCandidates(raw, context)

    state = { ...state, stage: 'discovering', found: ranked.length }
    saveCatalogExecution(state)

    // ── Stage: validating ────────────────────────────────────────────────────
    const existingAsins = new Set(getRuntimeProducts().map(p => p.asin))
    const validated     = validateCatalogCandidates(ranked, context, existingAsins)

    state = { ...state, stage: 'validating', validated: validated.length }
    saveCatalogExecution(state)

    // ── Stage: admitting — real catalog write ─────────────────────────────────
    const batch = validated.slice(0, Math.min(topDeficit.deficit, MAX_DISCOVERY_BATCH))

    state = { ...state, stage: 'admitting' }
    saveCatalogExecution(state)

    const admissionResult = admitCatalogCandidates(
      batch,
      admissionCtx,
      // Progress callback: update execution state after each product admitted
      (admittedCount, asin) => {
        state = {
          ...state,
          admitted:         admittedCount,
          currentCandidate: asin,
          lastAdmittedAsin: asin,
        }
        saveCatalogExecution(state)
      },
    )

    // ── Stage: completed ─────────────────────────────────────────────────────
    const completedAt = new Date().toISOString()
    state = {
      ...state,
      isRunning:        false,
      stage:            'completed',
      admitted:         admissionResult.admitted,
      currentCandidate: null,
      completedAt,
      remainingDeficit: Math.max(0, topDeficit.deficit - admissionResult.admitted),
    }
    saveCatalogExecution(state)

    // Sprint 4F: rebuild recommendations + alerts after new products are admitted
    if (admissionResult.admitted > 0) {
      rebuildRecommendations()
      generateAlerts()
    }

    return {
      status:    'completed',
      category:  topDeficit.category,
      deficit:   topDeficit.deficit,
      found:     ranked.length,
      validated: validated.length,
      prepared:  admissionResult.admitted,
      admitted:  admissionResult.admitted,
      pipelineId,
    }

  } catch (err) {
    try {
      const completedAt = new Date().toISOString()
      saveCatalogExecution({
        ...state,
        isRunning:   false,
        stage:       'failed',
        completedAt,
        errors:      [err instanceof Error ? err.message : String(err)],
      })
    } catch {
      // Intentionally swallowed
    }
    return { status: 'error' }
  }
}
