/**
 * components/ops/ProductStateBadge.tsx
 *
 * Visual state badge for product tier/status.
 * Covers: active, warning, degraded, suppressed, quarantined, archived.
 * Server component — no client JS.
 */

interface Props {
  tier:        string
  hasOverride?: boolean
  compact?:    boolean
}

const TIER_CONFIG: Record<string, {
  label:  string
  dot:    string
  badge:  string
}> = {
  active: {
    label: 'ACTIVE',
    dot:   'bg-green-500',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  },
  warning: {
    label: 'WARNING',
    dot:   'bg-yellow-400',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  },
  degraded: {
    label: 'DEGRADED',
    dot:   'bg-orange-400',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  },
  suppressed: {
    label: 'SUPPRESSED',
    dot:   'bg-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
  quarantined: {
    label: 'QUARANTINED',
    dot:   'bg-purple-500',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  },
  archived: {
    label: 'ARCHIVED',
    dot:   'bg-gray-400',
    badge: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  },
}

export function ProductStateBadge({ tier, hasOverride, compact }: Props) {
  const config = TIER_CONFIG[tier] ?? TIER_CONFIG.suppressed

  return (
    <span
      className={[
        'inline-flex items-center gap-1 font-bold rounded tracking-wide',
        compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5',
        config.badge,
      ].join(' ')}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      {config.label}
      {hasOverride && (
        <span className="ml-0.5 text-[8px] opacity-70 tracking-tighter">✎</span>
      )}
    </span>
  )
}
