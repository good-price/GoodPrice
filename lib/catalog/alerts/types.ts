/**
 * lib/catalog/alerts/types.ts
 *
 * Core types for the Alert Intelligence Engine — Sprint 4F.
 *
 * SERVER-ONLY.
 */

export type AlertType =
  | 'price-drop'
  | 'high-opportunity'
  | 'critical-lifecycle'
  | 'low-confidence'
  | 'replacement-needed'

export type AlertSeverity = 'low' | 'medium' | 'high'

export interface ProductAlert {
  id:       string
  asin:     string
  category: string

  type:     AlertType
  severity: AlertSeverity

  /** Human-readable explanation of why this alert was generated. */
  message: string

  createdAt:  string
  /** ISO — null while the alert is active. */
  resolvedAt: string | null
}

export interface AlertStore {
  updatedAt: string | null
  /** Keyed by alert id. */
  alerts:    Record<string, ProductAlert>
}

export interface AlertGovernance {
  totalAlerts: number
  low:         number
  medium:      number
  high:        number
  /** Alerts with resolvedAt === null. */
  unresolved:  number
}
