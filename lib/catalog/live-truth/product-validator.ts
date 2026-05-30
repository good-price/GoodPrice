/**
 * lib/catalog/live-truth/product-validator.ts
 *
 * Orchestrates a full live validation for a single product:
 *   1. Fetch and parse the Amazon page (amazon-parser.ts)
 *   2. Validate each dimension independently (title, pricing, availability, image)
 *   3. Compute composite truth score
 *   4. Classify status and collect issues
 *   5. Evaluate for quarantine recommendation
 *   6. Return the complete LiveTruthResult
 *
 * Does NOT perform file I/O — callers are responsible for persisting results.
 */

import type { LiveTruthResult } from './types'
import type { Product } from '@/types'
import { fetchAndParseProduct } from './amazon-parser'
import { validateTitle } from './title-validator'
import { validatePricing } from './pricing-validator'
import { validateAvailability } from './availability-validator'
import { validateImage } from './image-validator'
import { computeTruthScore, classifyStatus } from './truth-score'
import { evaluateForQuarantine } from './quarantine-engine'

// ── Issue collector ───────────────────────────────────────────────────────────

function collectIssues(
  result: Omit<LiveTruthResult, 'issues' | 'status' | 'truthScore' | 'isAvailable' | 'hasFakeDiscount' | 'hasTitleDrift' | 'hasImageDrift'>,
  quarantineReason: string,
): string[] {
  const issues: string[] = []

  // Quarantine flag (prefixed so reports.ts can filter on it)
  if (quarantineReason) {
    issues.push(`CUARENTENA: ${quarantineReason}`)
  }

  // Title
  if (result.title.hasDrift) {
    issues.push(`Deriva de título: ${result.title.reason}`)
  }

  // Pricing
  if (result.pricing.hasFakeDiscount) {
    issues.push(`Posible descuento falso: ${result.pricing.reason}`)
  }
  if (result.pricing.deltaPct !== undefined && Math.abs(result.pricing.deltaPct) > 15) {
    const sign = result.pricing.deltaPct > 0 ? '+' : ''
    issues.push(`Precio desactualizado (Δ ${sign}${result.pricing.deltaPct.toFixed(1)}%)`)
  }

  // Availability
  if (!result.availability.isAvailable && result.availability.status !== 'unknown') {
    issues.push(`No disponible: ${result.availability.reason}`)
  }

  // Image
  if (result.image.urlChanged && result.image.score <= 2) {
    issues.push(`Imagen cambiada: ${result.image.reason}`)
  }

  // Extraction
  if (result.extracted.isRobotCheck) {
    issues.push('Verificación de robot detectada — resultado pendiente')
  }

  return issues
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Validates a product against its live Amazon page.
 *
 * @param product       - Catalog product record
 * @param history       - Previous results for this product (newest first)
 * @param previousCheckAt - ISO timestamp of the last check (for freshness scoring)
 */
export async function validateProduct(
  product:         Product,
  history:         LiveTruthResult[] = [],
  previousCheckAt: string | null     = null,
): Promise<LiveTruthResult> {
  const asin      = product.asin!
  const productId = product.id!

  // ── Fetch live data from Amazon ───────────────────────────────────────────
  const extracted = await fetchAndParseProduct(asin)

  // ── Validate each dimension ───────────────────────────────────────────────
  const title = validateTitle(product.title, extracted.title)

  const pricing = validatePricing(
    product.price,
    extracted.priceUSD,
    extracted.oldPriceUSD,
  )

  const availability = validateAvailability(
    extracted.availabilityStatus,
    extracted.availability,
  )

  const image = validateImage(
    product.image,
    asin,
    extracted.imageUrl,
  )

  // ── Composite truth score ─────────────────────────────────────────────────
  const truthScore = computeTruthScore(title, pricing, availability, image, previousCheckAt)

  // ── Status classification ─────────────────────────────────────────────────
  const status = classifyStatus(truthScore, availability, extracted.confidence, title)

  // ── Quarantine evaluation ─────────────────────────────────────────────────
  // Build a partial result to pass to the quarantine engine
  const partial = {
    productId, asin,
    checkedAt: new Date().toISOString(),
    extracted, title, pricing, availability, image,
    truthScore, status,
    isAvailable:     availability.isAvailable,
    hasFakeDiscount: pricing.hasFakeDiscount,
    hasTitleDrift:   title.hasDrift,
    hasImageDrift:   image.urlChanged && image.score <= 2,
    confidence:      extracted.confidence,
    issues:          [] as string[],
  }

  const { recommend, reason: quarantineReason } = evaluateForQuarantine(partial, history)

  // ── Assemble final result ─────────────────────────────────────────────────
  const finalResult: LiveTruthResult = {
    ...partial,
    issues: collectIssues(partial, recommend ? quarantineReason : ''),
  }

  return finalResult
}
