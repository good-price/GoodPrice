import { Product, ColombiaRule } from '@/types'

/**
 * Colombia shipping rules derived from:
 * - Amazon Global shipping restrictions
 * - INVIMA cosmetic import regulations
 * - DIAN customs (aereo) hazmat / oversized limits
 * - Known brand shipping policies
 *
 * severity: 'block' → remove from catalog
 * severity: 'warn'  → keep but flag for review
 */
export const COLOMBIA_RULES: ColombiaRule[] = [
  // ── Brands that don't ship internationally ───────────────────────────────
  {
    type: 'brand',
    value: 'wyze',
    restriction: 'Wyze Labs no envía fuera de US/CA (política oficial)',
    severity: 'block',
  },
  {
    type: 'brand',
    value: 'irobot',
    restriction: 'iRobot en Chapter 11; soporte cloud incierto',
    severity: 'block',
  },
  // ── Categories with size/weight restrictions ─────────────────────────────
  {
    type: 'keyword',
    value: 'laserjet',
    restriction: 'Impresoras láser: electrónico grande/pesado, no envía internacional',
    severity: 'block',
  },
  {
    type: 'keyword',
    value: 'aspiradora',
    restriction: 'Electrodoméstico grande: política Amazon de bultos no internacionales',
    severity: 'warn',
  },
  // ── INVIMA: topical cosmetics blocked at Colombian customs ───────────────
  {
    type: 'keyword',
    value: 'crema hidratante',
    restriction: 'INVIMA Colombia: cosméticos tópicos requieren registro comercial',
    severity: 'block',
  },
  {
    type: 'keyword',
    value: 'loción',
    restriction: 'INVIMA Colombia: cosméticos tópicos requieren registro comercial',
    severity: 'block',
  },
  {
    type: 'keyword',
    value: 'protector solar',
    restriction: 'INVIMA Colombia: cosméticos tópicos requieren registro comercial',
    severity: 'block',
  },
  // ── Hazmat: large standalone batteries ──────────────────────────────────
  {
    type: 'keyword',
    value: '26800mah',
    restriction: 'Batería ≈99Wh standalone: bloqueada en transporte aéreo internacional',
    severity: 'block',
  },
  {
    type: 'keyword',
    value: '30000mah',
    restriction: 'Batería >100Wh standalone: bloqueada en transporte aéreo internacional',
    severity: 'block',
  },
  // ── Recalled products ────────────────────────────────────────────────────
  {
    type: 'asin',
    value: 'B001ARYU58',
    restriction: 'RECALL CPSC activo jun. 2025: mancuernas Bowflex 552 (3.8M unidades)',
    severity: 'block',
  },
]

/** Apply Colombia rules to a single product.
 *  Returns the product unchanged, or with `colombiaRestriction` set. */
export function applyColombiaRules(product: Product): Product {
  const titleLower = product.title.toLowerCase()
  const brandLower = (product.brand ?? '').toLowerCase()

  for (const rule of COLOMBIA_RULES) {
    let matched = false

    if (rule.type === 'brand') {
      matched = brandLower === rule.value || brandLower.includes(rule.value)
    } else if (rule.type === 'asin') {
      const asin = product.amazonUrl.match(/\/dp\/([A-Z0-9]{10})/)?.[1] ?? ''
      matched = asin === rule.value
    } else if (rule.type === 'keyword') {
      matched = titleLower.includes(rule.value)
    } else if (rule.type === 'category') {
      matched = product.category === rule.value
    }

    if (matched && rule.severity === 'block') {
      return { ...product, colombiaRestriction: rule.restriction }
    }
  }

  return product
}

/** Returns true if a product is safe for Colombian users */
export function isColombiaShippable(product: Product): boolean {
  const checked = applyColombiaRules(product)
  return !checked.colombiaRestriction
}
