/**
 * lib/ops/workspace/navigation.ts
 *
 * Sidebar section definitions for the GOODPRICE OPS Workspace.
 * Sections correspond to logical areas of the admin page, anchored by ID.
 *
 * SERVER-SAFE — no client imports.
 */

import type { SectionDef, SidebarGroup } from './types'

// ── Section registry ──────────────────────────────────────────────────────────

export const SECTION_DEFS: SectionDef[] = [
  // ── Overview ──────────────────────────────────────────────────────────────
  {
    id:          'overview',
    label:       'Overview',
    icon:        '◉',
    description: 'Estado del sistema, health score, alertas activas.',
    group:       'overview',
    anchor:      's-overview',
  },

  // ── Catalog ───────────────────────────────────────────────────────────────
  {
    id:          'catalog',
    label:       'Catálogo',
    icon:        '▤',
    description: 'Consola de operaciones, integridad, inteligencia.',
    group:       'overview',
    anchor:      's-catalog',
  },

  // ── Visibility ────────────────────────────────────────────────────────────
  {
    id:          'visibility',
    label:       'Visibilidad',
    icon:        '◎',
    description: 'Trust tiers, overrides, distribución de visibilidad.',
    group:       'overview',
    anchor:      's-visibility',
  },

  // ── Recovery ──────────────────────────────────────────────────────────────
  {
    id:          'recovery',
    label:       'Recovery',
    icon:        '⟳',
    description: 'Estabilización, candidatos de recuperación, recomendaciones.',
    group:       'overview',
    anchor:      's-recovery',
  },

  // ── Validation ────────────────────────────────────────────────────────────
  {
    id:          'validation',
    label:       'Validación',
    icon:        '✓',
    description: 'Auditoría, cuarentena, live truth, link health.',
    group:       'pipeline',
    anchor:      's-validation',
  },

  // ── Repair ────────────────────────────────────────────────────────────────
  {
    id:          'repair',
    label:       'Reparación',
    icon:        '⚙',
    description: 'Pipeline de reparación de imágenes y datos.',
    group:       'pipeline',
    anchor:      's-repair',
  },

  // ── Healing ───────────────────────────────────────────────────────────────
  {
    id:          'healing',
    label:       'Healing',
    icon:        '⟲',
    description: 'Ciclos autónomos de autocuración del catálogo.',
    group:       'pipeline',
    anchor:      's-healing',
  },

  // ── Pricing ───────────────────────────────────────────────────────────────
  {
    id:          'pricing',
    label:       'Precios',
    icon:        '◈',
    description: 'TRM, drift, salud de precios, truth scores.',
    group:       'commerce',
    anchor:      's-pricing',
  },

  // ── Colombia ──────────────────────────────────────────────────────────────
  {
    id:          'colombia',
    label:       'Colombia',
    icon:        '◉',
    description: 'Gate 10, disponibilidad de envíos, Amazon Global.',
    group:       'commerce',
    anchor:      's-colombia',
  },

  // ── Operations ────────────────────────────────────────────────────────────
  {
    id:          'operations',
    label:       'Operaciones',
    icon:        '⬡',
    description: 'Command center, acciones rápidas, PA-API.',
    group:       'data',
    anchor:      's-operations',
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  {
    id:          'analytics',
    label:       'Analytics',
    icon:        '▲',
    description: 'Clicks, categorías, productos muertos, sesiones.',
    group:       'data',
    anchor:      's-analytics',
  },

  // ── Logs ─────────────────────────────────────────────────────────────────
  {
    id:          'logs',
    label:       'Logs',
    icon:        '≡',
    description: 'Ops timeline, historial de acciones, audit trail.',
    group:       'data',
    anchor:      's-logs',
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  {
    id:          'settings',
    label:       'Configuración',
    icon:        '◌',
    description: 'Ajustes del workspace, preferencias de operador.',
    group:       'system',
    anchor:      's-settings',
  },
]

// ── Group metadata ────────────────────────────────────────────────────────────

export const GROUP_LABELS: Record<SidebarGroup, string> = {
  overview:  '',             // No label — top section
  pipeline:  'Pipeline',
  commerce:  'Commerce',
  data:      'Data',
  system:    'System',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getSectionDef(id: string): SectionDef | undefined {
  return SECTION_DEFS.find(s => s.id === id)
}

export function getSectionsByGroup(group: SidebarGroup): SectionDef[] {
  return SECTION_DEFS.filter(s => s.group === group)
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  'overview', 'pipeline', 'commerce', 'data', 'system',
]
