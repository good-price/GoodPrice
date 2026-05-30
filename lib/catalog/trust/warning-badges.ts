/**
 * lib/catalog/trust/warning-badges.ts
 *
 * Generates public-safe warning badges from visibility signals.
 *
 * IMPORTANT: Badges must NEVER expose internal system details.
 * No gate names, no score numbers, no technical identifiers.
 * Every label is copywritten for Colombian users.
 *
 * Badge → signal mapping:
 *   IMG_QUALITY        ← gate-5v (sub-quality image CDN)
 *   AVAILABILITY_CHECK ← gate-9 warning (first dead link, re-auditing)
 *   COLOMBIA_IMPORT    ← gate-10 (unavailable for Colombia)
 *   PRICE_UPDATE       ← (future: price drift override active)
 *   PARTIAL_INFO       ← gate-6 warning (audit score 50–69)
 *
 * SERVER-ONLY.
 */

import type { VisibilitySignal, WarningBadge, BadgeCode } from './types'

// ── Badge catalog ─────────────────────────────────────────────────────────────

const BADGE_DEFINITIONS: Record<BadgeCode, WarningBadge> = {
  IMG_QUALITY: {
    code:     'IMG_QUALITY',
    label:    'Imagen pendiente',
    severity: 'info',
  },
  AVAILABILITY_CHECK: {
    code:     'AVAILABILITY_CHECK',
    label:    'Validando disponibilidad',
    severity: 'info',
  },
  COLOMBIA_IMPORT: {
    code:     'COLOMBIA_IMPORT',
    label:    'Importación limitada',
    severity: 'warning',
  },
  PRICE_UPDATE: {
    code:     'PRICE_UPDATE',
    label:    'Precio en actualización',
    severity: 'info',
  },
  PARTIAL_INFO: {
    code:     'PARTIAL_INFO',
    label:    'Información parcialmente verificada',
    severity: 'info',
  },
}

// ── Mapping ───────────────────────────────────────────────────────────────────

/**
 * Maps gate signals to public-safe warning badges.
 * Deduplicates and returns only badges appropriate for the given signals.
 */
export function generateWarningBadges(signals: VisibilitySignal[]): WarningBadge[] {
  const codes = new Set<BadgeCode>()

  for (const signal of signals) {
    switch (signal.gate) {
      case 'gate-5v':
        // Sub-quality image CDN — shown on WARNING and DEGRADED products
        codes.add('IMG_QUALITY')
        break

      case 'gate-9':
        // First dead link detect — re-auditing, availability unclear
        if (signal.tier === 'warning') {
          codes.add('AVAILABILITY_CHECK')
        }
        break

      case 'gate-10':
        // Confirmed unavailable for Colombia → import limitation badge
        codes.add('COLOMBIA_IMPORT')
        break

      case 'gate-6':
        // Low audit score → partial information badge
        if (signal.tier === 'warning' || signal.tier === 'degraded') {
          codes.add('PARTIAL_INFO')
        }
        break

      case 'gate-11':
        // Healing suppression recovery → availability uncertain
        if (signal.tier === 'degraded') {
          codes.add('AVAILABILITY_CHECK')
        }
        break
    }
  }

  // Sort: 'warning' severity badges first, then 'info'
  return Array.from(codes)
    .map(code => BADGE_DEFINITIONS[code])
    .sort((a, b) =>
      a.severity === b.severity ? 0 :
      a.severity === 'warning' ? -1 : 1
    )
}

/**
 * Returns a single badge by code, or null if the code is unknown.
 * Useful for explicitly adding a badge (e.g. price override active).
 */
export function getBadge(code: BadgeCode): WarningBadge {
  return BADGE_DEFINITIONS[code]
}
