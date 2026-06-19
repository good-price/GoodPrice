/**
 * components/catalog/intelligence/ProductAlerts.tsx
 *
 * Renders active intelligence alerts for a product.
 * Server Component — no hooks, no client state.
 *
 * Intended for informational display only — no resolve action here.
 */

import type { ProductAlert, AlertSeverity, AlertType } from '@/lib/catalog/alerts/types'

interface Props {
  alerts: ProductAlert[]
}

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  high:   'bg-red-50 border-red-200 text-red-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low:    'bg-gray-50 border-gray-200 text-gray-600',
}

const TYPE_ICON: Record<AlertType, string> = {
  'price-drop':         '📉',
  'high-opportunity':   '🎯',
  'critical-lifecycle': '⚠️',
  'low-confidence':     '❓',
  'replacement-needed': '🔄',
}

export function ProductAlerts({ alerts }: Props) {
  // Only show active (unresolved) alerts to users
  const active = alerts.filter(a => a.resolvedAt === null)
  if (active.length === 0) return null

  // Show only medium and high severity to end users (low is operational noise)
  const userFacing = active.filter(a => a.severity !== 'low')
  if (userFacing.length === 0) return null

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Avisos
      </p>
      <div className="space-y-1.5" role="list" aria-label="Alertas del producto">
        {userFacing.map(alert => (
          <div
            key={alert.id}
            role="listitem"
            className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${SEVERITY_STYLES[alert.severity]}`}
          >
            <span aria-hidden="true">{TYPE_ICON[alert.type]}</span>
            <span>{alert.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
