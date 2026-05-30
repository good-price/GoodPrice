/**
 * lib/catalog/live-truth/availability-validator.ts
 *
 * Validates product availability signals extracted from Amazon product pages.
 *
 * Score (max 25):
 *   in_stock   → 25 pts  (confirmed available)
 *   limited    → 20 pts  (available but low stock — still sellable)
 *   unknown    → 12 pts  (could not determine — neutral)
 *   out_of_stock → 5 pts (temporarily out — may return)
 *   unavailable → 0 pts  (product archived, discontinued, or removed)
 *
 * Note: "unknown" receives a neutral score rather than zero because it may
 * just mean our parser couldn't find the availability element. We don't want
 * to suppress products due to parser limitations.
 */

import type { AvailabilityValidation, AvailabilityStatus } from './types'

const SCORE_MAP: Record<AvailabilityStatus, number> = {
  in_stock:     25,
  limited:      20,
  unknown:      12,
  out_of_stock:  5,
  unavailable:   0,
}

const REASON_MAP: Record<AvailabilityStatus, string> = {
  in_stock:     'Disponible en Amazon',
  limited:      'Stock limitado en Amazon',
  unknown:      'Disponibilidad no determinada',
  out_of_stock: 'Sin stock actualmente',
  unavailable:  'No disponible — posiblemente descontinuado o archivado',
}

export function validateAvailability(
  status:  AvailabilityStatus,
  rawText: string | undefined,
): AvailabilityValidation {
  return {
    score:       SCORE_MAP[status],
    isAvailable: status === 'in_stock' || status === 'limited',
    status,
    rawText,
    reason:      REASON_MAP[status],
  }
}
