/**
 * lib/ops/workspace/workspace-layout.ts
 *
 * Layout configuration constants and section anchor mappings.
 * Used by the admin page to add section ID anchors and by the sidebar
 * to build navigation targets.
 */

// ── Section anchor IDs (used in admin page as id="s-X") ──────────────────────

/** The id prefix used for all workspace section anchors in the admin page. */
export const SECTION_ANCHOR_PREFIX = 's-'

/** All section anchors in the order they appear on the admin page. */
export const SECTION_ANCHORS = [
  's-overview',
  's-operations',
  's-catalog',
  's-visibility',
  's-recovery',
  's-validation',
  's-repair',
  's-healing',
  's-pricing',
  's-colombia',
  's-analytics',
  's-logs',
  's-settings',
] as const

export type SectionAnchor = typeof SECTION_ANCHORS[number]

// ── Layout constants ──────────────────────────────────────────────────────────

export const SIDEBAR_WIDTH_EXPANDED  = 224   // px
export const SIDEBAR_WIDTH_COLLAPSED = 52    // px
export const TOPBAR_HEIGHT           = 48    // px
export const METRICS_STRIP_HEIGHT    = 44    // px
export const TABS_BAR_HEIGHT         = 36    // px

// ── Smooth scroll helper (client-side, tree-shakeable) ───────────────────────

/**
 * Scrolls the workspace main area to a section anchor.
 * Called client-side only.
 */
export function scrollToSection(anchor: string): void {
  if (typeof document === 'undefined') return
  const el = document.getElementById(anchor)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Extracts the WorkspaceSection name from an anchor id.
 * e.g. 's-catalog' → 'catalog'
 */
export function anchorToSection(anchor: string): string {
  return anchor.replace(SECTION_ANCHOR_PREFIX, '')
}

/**
 * Builds the anchor id from a section name.
 * e.g. 'catalog' → 's-catalog'
 */
export function sectionToAnchor(section: string): string {
  return `${SECTION_ANCHOR_PREFIX}${section}`
}
