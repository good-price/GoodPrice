/**
 * lib/catalog/self-healing/index.ts
 *
 * Public API for the GOODPRICE Self-Healing Catalog Automation System.
 *
 * ⚠ SERVER-ONLY — all modules use Node.js fs.
 * Do not import from client components.
 *
 * Usage (API routes and admin page):
 *   import { runHealingCycle, loadHealingReport, ... } from '@/lib/catalog/self-healing'
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  HealingActionType,
  HealingEvent,
  StaledProduct,
  DriftRepairType,
  DriftRepair,
  ReplacementCandidate,
  ReplacementSuggestion,
  SelfHealingReport,
  HealingCycleOptions,
  HealingCycleResult,
  HealingSchedule,
} from './types'

// ── Main orchestrator ─────────────────────────────────────────────────────────
export { runHealingCycle } from './auto-repair'

// ── Report persistence ────────────────────────────────────────────────────────
export {
  loadHealingReport,
  saveHealingReport,
  loadHealingEvents,
  appendHealingEvents,
  countRecoveredAllTime,
  countDriftRepairsAllTime,
} from './reports'

// ── Scheduler ─────────────────────────────────────────────────────────────────
export {
  getHealingSchedule,
  isCycleAllowed,
  recordCycleStart,
  getCycleCount,
} from './scheduler'

// ── Individual engines (for targeted use) ─────────────────────────────────────
export { identifyStaleProducts }          from './stale-engine'
export { runArchiveEngine }               from './archive-engine'
export { runRecoveryEngine }              from './recovery-engine'
export { runDriftRepair }                 from './drift-repair'
export { runRefreshEngine }               from './refresh-engine'
export { generateReplacementSuggestions } from './replacement-engine'
export { findReplacementCandidates }      from './candidate-finder'
export { runPromotionRecovery }           from './promotion-recovery'
