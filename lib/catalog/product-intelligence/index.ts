/**
 * lib/catalog/product-intelligence/index.ts
 *
 * Barrel — Sprint 5A.
 * SERVER-ONLY.
 */

export type { ProductBadge, BadgeType, ProductIntelligence } from './types'
export { emptyIntelligence }   from './types'
export { buildProductBadges }  from './builder'
export { getProductIntelligence } from './reader'
