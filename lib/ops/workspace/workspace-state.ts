/**
 * lib/ops/workspace/workspace-state.ts
 *
 * Default workspace state and localStorage helpers.
 * Client-side: uses localStorage.
 * Server-side: provides defaults only (no browser APIs).
 */

import type { WorkspaceState, WorkspaceTab, WorkspaceSection } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

export const WORKSPACE_STORAGE_KEY = 'goodprice-ops-workspace-v1'
export const WORKSPACE_VERSION     = 1

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_TABS: WorkspaceTab[] = [
  {
    id:        'tab-overview',
    label:     'Overview',
    section:   'overview',
    anchor:    's-overview',
    pinned:    true,
    createdAt: new Date(0).toISOString(),
  },
]

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  sidebarCollapsed: false,
  activeSection:    'overview',
  openTabs:         DEFAULT_TABS,
  activeTabId:      'tab-overview',
  pinnedMetricIds:  ['health-score', 'visible-pct', 'suppressed-count', 'active-jobs'],
  commandHistory:   [],
  version:          WORKSPACE_VERSION,
}

// ── Client utilities (browser-only) ──────────────────────────────────────────

/**
 * Loads workspace state from localStorage.
 * Falls back to default if missing or incompatible version.
 * SSR-safe — returns default on server.
 */
export function loadWorkspaceState(): WorkspaceState {
  if (typeof window === 'undefined') return { ...DEFAULT_WORKSPACE_STATE }
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_WORKSPACE_STATE }
    const parsed = JSON.parse(raw) as WorkspaceState
    if (parsed.version !== WORKSPACE_VERSION) {
      return { ...DEFAULT_WORKSPACE_STATE }
    }
    // Ensure DEFAULT_TABS always exist
    const hasOverview = parsed.openTabs.some(t => t.id === 'tab-overview')
    if (!hasOverview) {
      parsed.openTabs = [DEFAULT_TABS[0], ...parsed.openTabs]
    }
    return parsed
  } catch {
    return { ...DEFAULT_WORKSPACE_STATE }
  }
}

/**
 * Persists workspace state to localStorage.
 * SSR-safe — no-op on server.
 */
export function saveWorkspaceState(state: WorkspaceState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state))
  } catch { /* localStorage full or disabled */ }
}

// ── Tab helpers ───────────────────────────────────────────────────────────────

export function makeTabId(): string {
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
}

export function makeTab(section: WorkspaceSection, anchor: string, label: string): WorkspaceTab {
  return {
    id:        makeTabId(),
    label,
    section,
    anchor,
    pinned:    false,
    createdAt: new Date().toISOString(),
  }
}

// ── Command history helpers ───────────────────────────────────────────────────

const MAX_HISTORY = 20

export function addToCommandHistory(current: string[], command: string): string[] {
  const deduped = current.filter(c => c !== command)
  return [command, ...deduped].slice(0, MAX_HISTORY)
}
