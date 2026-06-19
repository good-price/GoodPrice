/**
 * components/catalog/intelligence/ProductBadges.tsx
 *
 * Renders up to 4 intelligence badges for a product.
 * Server Component — no hooks, no client state.
 */

import type { ProductBadge, BadgeType } from '@/lib/catalog/product-intelligence/types'

interface Props {
  badges: ProductBadge[]
}

const BADGE_STYLES: Record<BadgeType, string> = {
  'critical':        'bg-red-50 text-red-700 border-red-200',
  'top-opportunity': 'bg-green-50 text-green-700 border-green-200',
  'recommended':     'bg-amber-50 text-amber-700 border-amber-200',
  'price-drop':      'bg-blue-50 text-blue-700 border-blue-200',
  'high-confidence': 'bg-purple-50 text-purple-700 border-purple-200',
  'best-value':      'bg-teal-50 text-teal-700 border-teal-200',
}

const BADGE_ICONS: Record<BadgeType, string> = {
  'critical':        '⚠️',
  'top-opportunity': '🎯',
  'recommended':     '⭐',
  'price-drop':      '📉',
  'high-confidence': '✓',
  'best-value':      '💎',
}

export function ProductBadges({ badges }: Props) {
  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2" aria-label="Señales de inteligencia">
      {badges.map(badge => (
        <span
          key={badge.type}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${BADGE_STYLES[badge.type]}`}
        >
          <span aria-hidden="true">{BADGE_ICONS[badge.type]}</span>
          {badge.label}
        </span>
      ))}
    </div>
  )
}
