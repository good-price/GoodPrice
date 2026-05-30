/**
 * lib/ops/workspace/command-palette.ts
 *
 * Command registry for the GOODPRICE OPS workspace Ctrl+K palette.
 * Commands are serializable (no function references) — actions are identified
 * by type + value and executed by the CommandPalette client component.
 */

import type { CommandDef } from './types'

// ── Command registry ──────────────────────────────────────────────────────────

export const COMMAND_DEFS: CommandDef[] = [
  // ── Navigation ─────────────────────────────────────────────────────────────
  {
    id:          'nav-overview',
    label:       'Ir a Overview',
    description: 'Estado del sistema y alertas activas',
    icon:        '◉',
    group:       'Navegar',
    actionType:  'navigate',
    actionValue: 's-overview',
    tags:        ['overview', 'estado', 'sistema', 'health'],
  },
  {
    id:          'nav-catalog',
    label:       'Ir a Catálogo',
    description: 'Consola de operaciones del catálogo',
    icon:        '▤',
    group:       'Navegar',
    actionType:  'navigate',
    actionValue: 's-catalog',
    tags:        ['catalogo', 'productos', 'tabla', 'operaciones'],
  },
  {
    id:          'nav-visibility',
    label:       'Ir a Visibilidad',
    description: 'Trust tiers, overrides, distribución',
    icon:        '◎',
    group:       'Navegar',
    actionType:  'navigate',
    actionValue: 's-visibility',
    tags:        ['visibilidad', 'tiers', 'overrides', 'trust'],
  },
  {
    id:          'nav-recovery',
    label:       'Ir a Recovery',
    description: 'Estabilización y candidatos de recuperación',
    icon:        '⟳',
    group:       'Navegar',
    actionType:  'navigate',
    actionValue: 's-recovery',
    tags:        ['recovery', 'recuperacion', 'estabilizacion'],
  },
  {
    id:          'nav-validation',
    label:       'Ir a Validación',
    description: 'Auditoría, cuarentena, live truth',
    icon:        '✓',
    group:       'Navegar',
    actionType:  'navigate',
    actionValue: 's-validation',
    tags:        ['validacion', 'auditoria', 'cuarentena', 'truth'],
  },
  {
    id:          'nav-repair',
    label:       'Ir a Reparación',
    description: 'Pipeline de reparación de imágenes',
    icon:        '⚙',
    group:       'Navegar',
    actionType:  'navigate',
    actionValue: 's-repair',
    tags:        ['reparacion', 'repair', 'imagenes', 'pipeline'],
  },
  {
    id:          'nav-healing',
    label:       'Ir a Healing',
    description: 'Ciclos autónomos de autocuración',
    icon:        '⟲',
    group:       'Navegar',
    actionType:  'navigate',
    actionValue: 's-healing',
    tags:        ['healing', 'autocuracion', 'autonomo'],
  },
  {
    id:          'nav-pricing',
    label:       'Ir a Precios',
    description: 'TRM, drift, truth scores de precios',
    icon:        '◈',
    group:       'Navegar',
    actionType:  'navigate',
    actionValue: 's-pricing',
    tags:        ['precios', 'trm', 'drift', 'pricing'],
  },
  {
    id:          'nav-colombia',
    label:       'Ir a Colombia',
    description: 'Gate 10 y disponibilidad de envíos',
    icon:        '◉',
    group:       'Navegar',
    actionType:  'navigate',
    actionValue: 's-colombia',
    tags:        ['colombia', 'gate10', 'envios', 'amazon global'],
  },
  {
    id:          'nav-analytics',
    label:       'Ir a Analytics',
    description: 'Clicks, categorías y sesiones',
    icon:        '▲',
    group:       'Navegar',
    actionType:  'navigate',
    actionValue: 's-analytics',
    tags:        ['analytics', 'clicks', 'categorias', 'sesiones'],
  },
  {
    id:          'nav-logs',
    label:       'Ir a Logs',
    description: 'Ops timeline y audit trail',
    icon:        '≡',
    group:       'Navegar',
    actionType:  'navigate',
    actionValue: 's-logs',
    tags:        ['logs', 'timeline', 'audit', 'historial'],
  },

  // ── Pipeline actions ────────────────────────────────────────────────────────
  {
    id:          'run-recovery',
    label:       'Run Recovery Pipeline',
    description: 'Ejecuta el pipeline completo de recuperación',
    icon:        '⟳',
    group:       'Ejecutar',
    shortcut:    '⌘R',
    actionType:  'api_call',
    actionValue: '/api/ops/run',
    tags:        ['recovery', 'pipeline', 'recuperar', 'run'],
  },
  {
    id:          'run-repair',
    label:       'Run Repair Pipeline',
    description: 'Repara imágenes y datos del catálogo',
    icon:        '⚙',
    group:       'Ejecutar',
    actionType:  'api_call',
    actionValue: '/api/catalog/repair/run',
    tags:        ['repair', 'reparar', 'imagenes'],
  },
  {
    id:          'run-live-truth',
    label:       'Run Live Truth',
    description: 'Valida precios y disponibilidad en tiempo real',
    icon:        '✓',
    group:       'Ejecutar',
    actionType:  'api_call',
    actionValue: '/api/catalog/live-truth/run',
    tags:        ['truth', 'validar', 'precios', 'live'],
  },
  {
    id:          'run-healing',
    label:       'Run Self-Healing',
    description: 'Ejecuta un ciclo de autocuración autónoma',
    icon:        '⟲',
    group:       'Ejecutar',
    actionType:  'api_call',
    actionValue: '/api/catalog/self-healing/run',
    tags:        ['healing', 'autocuracion', 'autonomo'],
  },
  {
    id:          'run-trust',
    label:       'Recompute Trust Tiers',
    description: 'Recomputa todos los tiers de confiabilidad',
    icon:        '◎',
    group:       'Ejecutar',
    actionType:  'api_call',
    actionValue: '/api/catalog/trust/recompute',
    tags:        ['trust', 'recompute', 'tiers', 'recomputar'],
  },
  {
    id:          'run-stabilization',
    label:       'Run Stabilization Report',
    description: 'Recomputa el reporte de estabilización del catálogo',
    icon:        '◉',
    group:       'Ejecutar',
    actionType:  'api_call',
    actionValue: '/api/catalog/stabilization/run',
    tags:        ['stabilization', 'estabilizacion', 'report'],
  },
  {
    id:          'run-link-audit',
    label:       'Run Link Audit',
    description: 'Audita los enlaces de Amazon (Gate 9)',
    icon:        '⚙',
    group:       'Ejecutar',
    actionType:  'api_call',
    actionValue: '/api/catalog/link-audit/run',
    tags:        ['links', 'enlaces', 'audit', 'gate9'],
  },
  {
    id:          'run-colombia-audit',
    label:       'Run Colombia Audit',
    description: 'Verifica disponibilidad de envíos a Colombia',
    icon:        '◉',
    group:       'Ejecutar',
    actionType:  'api_call',
    actionValue: '/api/catalog/colombia-audit/run',
    tags:        ['colombia', 'gate10', 'envios', 'audit'],
  },
]

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Filters commands by query (matches label, description, tags, group).
 * Returns scored results sorted by relevance.
 */
export function searchCommands(query: string): CommandDef[] {
  if (!query.trim()) return COMMAND_DEFS

  const q = query.toLowerCase().trim()
  const terms = q.split(/\s+/)

  const scored = COMMAND_DEFS.map(cmd => {
    const haystack = [
      cmd.label,
      cmd.description ?? '',
      cmd.group,
      ...cmd.tags,
    ].join(' ').toLowerCase()

    let score = 0
    for (const term of terms) {
      if (cmd.label.toLowerCase().startsWith(term)) score += 10
      else if (cmd.label.toLowerCase().includes(term)) score += 5
      else if (haystack.includes(term)) score += 2
    }
    return { cmd, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.cmd)
}

/**
 * Groups commands by their group field.
 */
export function groupCommands(cmds: CommandDef[]): { group: string; commands: CommandDef[] }[] {
  const map = new Map<string, CommandDef[]>()
  for (const cmd of cmds) {
    const list = map.get(cmd.group) ?? []
    list.push(cmd)
    map.set(cmd.group, list)
  }
  return Array.from(map.entries()).map(([group, commands]) => ({ group, commands }))
}
