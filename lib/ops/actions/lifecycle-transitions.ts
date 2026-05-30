/**
 * lib/ops/actions/lifecycle-transitions.ts
 *
 * Defines valid lifecycle state transitions for product actions.
 *
 * States: active | warning | degraded | suppressed | quarantined | archived
 *
 * This module is the source of truth for "can action X be taken on a product
 * currently in state Y?" — separate from gate enforcement.
 *
 * SERVER-ONLY.
 */

import type { ProductAction } from './types'

// ── Transition table ───────────────────────────────────────────────────────────

/**
 * For each (currentTier, action) pair, define whether the transition is allowed.
 *
 * 'archived' is a terminal state — no transitions out.
 * 'quarantined' can only transition to 'suppressed' via unquarantine.
 *
 * Note: 'activate' on a suppressed product is allowed as an override action,
 * but action-validators.ts will enforce that only soft-gate suppressions
 * can be overridden this way.
 */
const ALLOWED: Record<string, Set<ProductAction>> = {
  active: new Set<ProductAction>([
    'downgrade', 'suppress', 'quarantine', 'archive',
    'repair', 'revalidate', 'refresh-truth', 'refresh-pricing', 'rerun-repair',
  ]),
  warning: new Set<ProductAction>([
    'activate', 'downgrade', 'suppress', 'quarantine', 'archive', 'restore',
    'repair', 'revalidate', 'refresh-truth', 'refresh-pricing', 'rerun-repair',
  ]),
  degraded: new Set<ProductAction>([
    'activate', 'downgrade', 'suppress', 'quarantine', 'archive', 'restore',
    'repair', 'revalidate', 'refresh-truth', 'refresh-pricing', 'rerun-repair',
  ]),
  suppressed: new Set<ProductAction>([
    'activate', 'quarantine', 'archive', 'restore',
    'repair', 'revalidate', 'refresh-truth', 'refresh-pricing', 'rerun-repair',
  ]),
  quarantined: new Set<ProductAction>([
    'unquarantine',  // only exit: unquarantine (transitions to suppressed)
  ]),
  archived: new Set<ProductAction>([
    // terminal — no transitions allowed
  ]),
  // Override states behave the same as their base tier
  'override-active': new Set<ProductAction>([
    'downgrade', 'suppress', 'quarantine', 'archive', 'restore',
    'repair', 'revalidate', 'refresh-truth', 'refresh-pricing', 'rerun-repair',
  ]),
  'override-suppressed': new Set<ProductAction>([
    'activate', 'quarantine', 'archive', 'restore',
    'repair', 'revalidate', 'refresh-truth', 'refresh-pricing', 'rerun-repair',
  ]),
}

// ── Target state map ───────────────────────────────────────────────────────────

/**
 * The resulting state after a successful action.
 * Pipeline actions don't change state (they queue work), so they return null.
 */
export const TARGET_STATE: Partial<Record<ProductAction, string | null>> = {
  activate:       'active (override)',
  downgrade:      'degraded (override)',
  suppress:       'suppressed (override)',
  quarantine:     'quarantined',
  unquarantine:   'suppressed',
  archive:        'archived',
  restore:        'automated (override removed)',
  repair:         null,  // no state change — pipeline queued
  revalidate:     null,
  'refresh-truth':    null,
  'refresh-pricing':  null,
  'rerun-repair':     null,
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the given action can be taken on a product in the given tier.
 */
export function isTransitionAllowed(
  currentTier: string,
  action:      ProductAction,
): boolean {
  const allowed = ALLOWED[currentTier] ?? ALLOWED['suppressed']
  return allowed.has(action)
}

/**
 * Returns the human-readable target state after the action, or null for
 * pipeline-queue actions that don't change visibility state.
 */
export function getTargetState(action: ProductAction): string | null {
  return TARGET_STATE[action] ?? null
}

/**
 * Returns all actions available for a given tier.
 */
export function getAvailableActionsForTier(tier: string): ProductAction[] {
  return Array.from(ALLOWED[tier] ?? new Set<ProductAction>())
}
