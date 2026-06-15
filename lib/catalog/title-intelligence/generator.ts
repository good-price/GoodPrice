import type { TitleInput, TitleOutput } from './types'
import { removeNoise }              from './noise'
import { extractAttributes }        from './extractor'
import { getBenefitForProductType } from './product-type'
import { getCategoryBenefits }      from './vocabulary'

// ── Title builders ─────────────────────────────────────────────────────────────

/**
 * Identifier = model (alphanumeric code) or productLine (named family).
 * Variant (capacity/size) is appended when present and identifier exists.
 */
function buildTitle(
  brand:       string,
  model:       string,
  productLine: string,
  variant:     string,
  benefit:     string,
): string {
  const identifier = model || productLine
  if (!identifier) return `${brand} – ${benefit}`

  const parts = [brand, identifier]
  // Only append variant when it adds meaningful info (not when redundant with identifier)
  if (variant && !identifier.toLowerCase().includes(variant.toLowerCase())) {
    parts.push(variant)
  }
  return `${parts.join(' ')} – ${benefit}`
}

function buildShortTitle(
  brand:       string,
  model:       string,
  productLine: string,
  coreNoun:    string,
): string {
  if (model) return `${brand} ${model}`
  if (productLine) return `${brand} ${productLine}`
  return `${brand} ${coreNoun}`
}

// ── Confidence scoring ─────────────────────────────────────────────────────────

function computeConfidence(
  brand:               string,
  model:               string,
  productLine:         string,
  productType:         string | null,
  usedSpecificBenefit: boolean,
): number {
  let score = 0.50
  if (brand && brand !== 'Producto')  score += 0.15
  if (model || productLine)           score += 0.15
  if (productType)                    score += 0.10
  if (usedSpecificBenefit)            score += 0.10
  return Math.min(Math.round(score * 100) / 100, 1.0)
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function generateTitle(input: TitleInput): TitleOutput {
  const cleaned   = removeNoise(input.amazonTitle)
  const attrs     = extractAttributes(cleaned, input.brand, input.category)

  const specific  = getBenefitForProductType(attrs.productType)
  const pool      = getCategoryBenefits(input.category)
  const poolIdx   = (attrs.brand.charCodeAt(0) + attrs.brand.length) % pool.length
  const benefit   = specific ?? pool[poolIdx]

  const title      = buildTitle(attrs.brand, attrs.model, attrs.productLine, attrs.variant, benefit)
  const shortTitle = buildShortTitle(attrs.brand, attrs.model, attrs.productLine, attrs.coreNoun)
  const confidence = computeConfidence(
    attrs.brand,
    attrs.model,
    attrs.productLine,
    attrs.productType,
    specific !== null,
  )

  return { amazonTitle: input.amazonTitle, title, shortTitle, confidence }
}
