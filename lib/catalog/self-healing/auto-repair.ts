/**
 * lib/catalog/self-healing/auto-repair.ts
 *
 * Main orchestrator for the self-healing catalog automation system.
 *
 * Healing cycle pipeline:
 *   1. Identify stale products (priority boost targets)
 *   2. Archive consistently-failing products (auto-suppress)
 *   3. Recover products whose truth score has improved
 *   4. Apply drift repairs (price & image corrections)
 *   5. Generate replacement suggestions for suppressed products
 *   6. Flag recovered products for promotion
 *   7. Refresh the validation queue priorities
 *   8. Persist healing report + rolling event log
 *
 * All writes are guarded by dryRun. Pass { dryRun: true } to audit
 * what the system would do without making any changes.
 *
 * SERVER-ONLY.
 */

import { getPublicProducts }          from '@/lib/catalog/public'
import { getAllProducts }             from '@/data/catalog'
import { getSuppressedCount }        from '@/lib/catalog/live-truth'
import { identifyStaleProducts }     from './stale-engine'
import { runArchiveEngine }          from './archive-engine'
import { runRecoveryEngine }         from './recovery-engine'
import { runDriftRepair }            from './drift-repair'
import { generateReplacementSuggestions } from './replacement-engine'
import { runPromotionRecovery }      from './promotion-recovery'
import { runRefreshEngine }          from './refresh-engine'
import { recordCycleStart, getCycleCount } from './scheduler'
import {
  saveHealingReport,
  appendHealingEvents,
  countRecoveredAllTime,
  countDriftRepairsAllTime,
} from './reports'
import type { HealingCycleOptions, HealingCycleResult, SelfHealingReport } from './types'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Execute a full self-healing cycle.
 *
 * @param options  Tuning parameters (all optional — safe defaults apply).
 * @returns        Summary of all actions taken (or simulated if dryRun).
 */
export async function runHealingCycle(
  options: HealingCycleOptions = {},
): Promise<HealingCycleResult> {
  const {
    dryRun                = false,
    maxArchive            = 10,
    maxRecover            = 20,
    maxDriftRepairs       = 20,
    minRecoveryScore      = 60,
    archiveConsecutiveChecks = 2,
    archiveScoreThreshold = 30,
  } = options

  const startMs = Date.now()

  // Record cycle start (updates schedule + increments counter)
  const schedule = dryRun ? null : recordCycleStart()
  const cycleCount = schedule?.cycleCount ?? getCycleCount()

  // ── 1. Public catalog snapshot ─────────────────────────────────────────────
  const publicProducts  = getPublicProducts()      // all currently-visible products
  const allCatalogRaw   = getAllProducts()          // all products including inactive

  // ── 2. Stale identification ────────────────────────────────────────────────
  const staleProducts = identifyStaleProducts(publicProducts)

  // ── 3. Archive engine ──────────────────────────────────────────────────────
  const archived = runArchiveEngine(publicProducts, {
    dryRun,
    maxArchive,
    consecutiveChecks: archiveConsecutiveChecks,
    scoreThreshold:    archiveScoreThreshold,
  })

  // ── 4. Recovery engine ─────────────────────────────────────────────────────
  const recovered = runRecoveryEngine({
    dryRun,
    maxRecover,
    minRecoveryScore,
  })

  // ── 5. Drift repair ────────────────────────────────────────────────────────
  const driftRepairs = runDriftRepair(publicProducts, {
    dryRun,
    maxRepairs: maxDriftRepairs,
  })

  // ── 6. Replacement suggestions (read-only — no dryRun guard needed) ────────
  const replacements = generateReplacementSuggestions(
    allCatalogRaw,
    publicProducts,
  )

  // ── 7. Promotion recovery ──────────────────────────────────────────────────
  runPromotionRecovery(recovered)

  // ── 8. Refresh validation queue ────────────────────────────────────────────
  if (!dryRun) {
    runRefreshEngine(publicProducts, staleProducts)
  }

  // ── 9. Persist healing report + event log ──────────────────────────────────
  const allEvents = [...archived, ...recovered]
  if (!dryRun) {
    appendHealingEvents(allEvents)
  }

  const report: SelfHealingReport = {
    generatedAt:         new Date().toISOString(),
    cycleCount,
    lastCycleAt:         schedule?.lastCycleAt ?? new Date().toISOString(),
    newlySuppressed:     archived,
    newlyRecovered:      recovered,
    driftRepairs,
    replacements,
    staleProducts,
    suppressedCount:     getSuppressedCount(),
    recoveredAllTime:    countRecoveredAllTime() + (dryRun ? 0 : recovered.length),
    driftRepairsAllTime: countDriftRepairsAllTime() + (dryRun ? 0 : driftRepairs.length),
  }

  if (!dryRun) {
    saveHealingReport(report)
  }

  return {
    ok:           true,
    dryRun,
    durationMs:   Date.now() - startMs,
    archived,
    recovered,
    driftRepairs,
    replacements,
    stale:        staleProducts,
    report,
  }
}
