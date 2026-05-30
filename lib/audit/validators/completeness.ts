/**
 * GOODPRICE Audit — Completeness Validator
 *
 * Checks that each product has all required fields populated with
 * plausible values. No network calls — purely in-memory data inspection.
 *
 * Required fields:  id, asin, title, category, image, price, rating, reviews
 * Recommended:      brand, badge, oldPrice (for isOffer products)
 *
 * Suspicious value thresholds (heuristic, not hard blocks):
 *   price   < 1          → likely placeholder
 *   price   > 2000       → unusually expensive (may be correct, flag anyway)
 *   rating  < 1 or > 5   → impossible
 *   reviews < 10         → suspiciously few
 *   reviews > 5_000_000  → suspiciously many
 *   rating === 5.0 with reviews < 50 → synthetic/fake review signal
 */

import type { RawProduct } from '@/types'
import type { CompletenessCheckResult, AuditSeverity } from '../types'

const REQUIRED_FIELDS: (keyof RawProduct)[] = [
  'id', 'asin', 'title', 'category', 'image', 'price', 'rating', 'reviews',
]

/** Run a full completeness audit for a single raw product */
export function auditCompleteness(product: RawProduct): CompletenessCheckResult {
  const { productId = product.id } = { productId: product.id }
  const notes: string[] = []
  const missingFields: string[] = []
  const suspiciousValues: string[] = []

  // ── Required fields ───────────────────────────────────────────────────────

  for (const field of REQUIRED_FIELDS) {
    const val = product[field]
    if (val === undefined || val === null || val === '') {
      missingFields.push(field)
    }
  }

  if (missingFields.length > 0) {
    notes.push(`Campos requeridos faltantes: ${missingFields.join(', ')}`)
  }

  // ── Recommended fields ────────────────────────────────────────────────────

  if (!product.brand) {
    notes.push('Campo "brand" ausente — recomendado para filtros y SEO')
    suspiciousValues.push('brand: vacío')
  }

  if (product.isOffer && !product.oldPrice) {
    notes.push('Producto marcado isOffer=true pero sin oldPrice para mostrar el descuento')
    suspiciousValues.push('oldPrice: ausente en producto isOffer')
  }

  // ── Value range checks ────────────────────────────────────────────────────

  if (product.price !== undefined) {
    if (product.price < 1) {
      suspiciousValues.push(`price: ${product.price} (< $1 — posible placeholder)`)
      notes.push(`Precio sospechosamente bajo: $${product.price}`)
    } else if (product.price > 2_000) {
      suspiciousValues.push(`price: ${product.price} (> $2000 — verificar)`)
      notes.push(`Precio inusualmente alto: $${product.price} — verificar si es correcto`)
    }
  }

  if (product.oldPrice !== undefined && product.price !== undefined) {
    if (product.oldPrice <= product.price) {
      suspiciousValues.push(`oldPrice (${product.oldPrice}) ≤ price (${product.price}) — descuento incoherente`)
      notes.push('El precio antiguo es menor o igual al precio actual — descuento incoherente')
    }
  }

  if (product.rating !== undefined) {
    if (product.rating < 0 || product.rating > 5) {
      suspiciousValues.push(`rating: ${product.rating} (fuera de rango 0–5)`)
      notes.push(`Rating fuera de rango: ${product.rating} (debe ser 0.0–5.0)`)
    } else if (product.rating === 5.0 && (product.reviews ?? 0) < 50) {
      suspiciousValues.push(`rating: 5.0 con solo ${product.reviews} reseñas — señal de reviews sintéticas`)
      notes.push('Rating perfecto 5.0 con muy pocas reseñas — puede ser dato sintético')
    }
  }

  if (product.reviews !== undefined) {
    if (product.reviews < 10) {
      suspiciousValues.push(`reviews: ${product.reviews} (< 10 — sospechosamente pocos)`)
      notes.push(`Número de reseñas muy bajo: ${product.reviews}`)
    } else if (product.reviews > 5_000_000) {
      suspiciousValues.push(`reviews: ${product.reviews} (> 5M — verificar)`)
      notes.push(`Número de reseñas inusualmente alto: ${product.reviews.toLocaleString()}`)
    }
  }

  // ── Title quality ─────────────────────────────────────────────────────────

  if (product.title) {
    if (product.title.length < 20) {
      suspiciousValues.push(`title: demasiado corto (${product.title.length} chars)`)
      notes.push(`Título muy corto: "${product.title}" — puede ser un placeholder`)
    }
    if (product.title.toLowerCase().includes('lorem ipsum')) {
      suspiciousValues.push('title: contiene "lorem ipsum"')
      notes.push('Título contiene texto de placeholder "lorem ipsum"')
    }
  }

  // ── Image URL format ──────────────────────────────────────────────────────

  if (product.image && !product.image.startsWith('http')) {
    suspiciousValues.push(`image: URL no comienza con http`)
    notes.push(`URL de imagen inválida: "${product.image}"`)
  }

  // ── Determine severity ────────────────────────────────────────────────────

  let severity: AuditSeverity = 'ok'

  if (missingFields.length > 0) {
    severity = missingFields.some(f => ['price', 'asin', 'title', 'image'].includes(f))
      ? 'critical'
      : 'warning'
  } else if (suspiciousValues.length >= 3) {
    severity = 'warning'
  } else if (suspiciousValues.length > 0) {
    severity = 'info'
  }

  if (notes.length === 0) {
    notes.push('Datos completos y coherentes — sin campos faltantes ni valores sospechosos')
  }

  return {
    productId,
    missingFields,
    suspiciousValues,
    severity,
    notes,
  }
}
