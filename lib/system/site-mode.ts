/**
 * lib/system/site-mode.ts
 *
 * Site-wide operation mode management.
 *
 * Modes:
 *   public               — Normal operation. All public routes accessible.
 *   development          — Manual lockdown. Public routes redirect to /en-desarrollo.
 *   maintenance          — Operator-triggered maintenance. Public routes redirect.
 *   scheduled_maintenance — Automated lockdown (e.g., 3AM cycle). Same redirect
 *                           behavior as maintenance, but includes scheduledEndAt.
 *
 * Guarantees:
 *   - Any invalid stored value falls back to 'public'.
 *   - File created on first write; directory auto-created.
 *   - All operations are synchronous (consistent with project pattern).
 *
 * SERVER-ONLY.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ── Types ──────────────────────────────────────────────────────────────────────

export type SiteMode =
  | 'public'
  | 'development'
  | 'maintenance'
  | 'scheduled_maintenance'

export interface SiteModeState {
  mode:            SiteMode
  updatedAt:       string | null
  previousMode:    SiteMode | null
  /**
   * ISO timestamp of when the scheduled_maintenance mode is expected to end.
   * Only meaningful when mode === 'scheduled_maintenance'.
   * Set by runMasterCycle() at cycle start; cleared on mode change.
   */
  scheduledEndAt?: string | null
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ALLOWED_MODES: SiteMode[] = [
  'public',
  'development',
  'maintenance',
  'scheduled_maintenance',
]

const MODE_PATH = join(process.cwd(), 'data', 'system', 'site-mode.json')

// ── Helpers ────────────────────────────────────────────────────────────────────

function isAllowedMode(value: unknown): value is SiteMode {
  return ALLOWED_MODES.includes(value as SiteMode)
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Reads the current site mode from disk.
 * Returns { mode: 'public', ... } if the file is missing, unreadable, or corrupt.
 * Invalid stored mode values fall back to 'public'.
 */
export function readSiteMode(): SiteModeState {
  if (!existsSync(MODE_PATH)) {
    return { mode: 'public', updatedAt: null, previousMode: null }
  }
  try {
    const raw  = readFileSync(MODE_PATH, 'utf-8')
    const data = JSON.parse(raw) as Record<string, unknown>

    const mode  = isAllowedMode(data.mode) ? data.mode : 'public'
    const prev  = isAllowedMode(data.previousMode) ? data.previousMode : null
    const upd   = typeof data.updatedAt === 'string' ? data.updatedAt : null
    const end   = typeof data.scheduledEndAt === 'string' ? data.scheduledEndAt : null

    return { mode, updatedAt: upd, previousMode: prev, scheduledEndAt: end }
  } catch {
    return { mode: 'public', updatedAt: null, previousMode: null }
  }
}

/**
 * Sets the site mode and persists to disk.
 *
 * @param newMode          - Target mode. Must be one of the four allowed values.
 * @param scheduledEndAt   - Optional ISO timestamp for when 'scheduled_maintenance'
 *                           is expected to end. Ignored for other modes.
 *
 * Throws if `newMode` is not a valid SiteMode value.
 */
export function setSiteMode(
  newMode:        SiteMode,
  scheduledEndAt?: string | null,
): SiteModeState {
  if (!isAllowedMode(newMode)) {
    throw new Error(
      `Invalid site mode: "${newMode}". Allowed: ${ALLOWED_MODES.join(', ')}`,
    )
  }

  const current = readSiteMode()

  const state: SiteModeState = {
    mode:          newMode,
    updatedAt:     new Date().toISOString(),
    previousMode:  current.mode,
    scheduledEndAt: newMode === 'scheduled_maintenance'
      ? (scheduledEndAt ?? null)
      : null,
  }

  mkdirSync(join(process.cwd(), 'data', 'system'), { recursive: true })
  writeFileSync(MODE_PATH, JSON.stringify(state, null, 2), 'utf-8')

  return state
}

/**
 * Returns true if the site is in any mode that hides public content.
 * Useful for middleware and page-level guards.
 */
export function isPubliclyLocked(mode: SiteMode): boolean {
  return mode === 'development' || mode === 'maintenance' || mode === 'scheduled_maintenance'
}
