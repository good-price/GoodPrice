/**
 * GOODPRICE Pricing — Currency Formatting Utilities
 *
 * Formats prices for display in the Colombian market context.
 *
 * Core design decisions:
 *   - Primary display currency: USD (Amazon primary retailer)
 *   - Secondary display: COP equivalent shown alongside USD
 *   - Locale: es-CO for number formatting
 *   - COP format: "$ 1.299.000" (period thousands, no cents)
 *   - USD format: "$79.99" (standard US format with cents)
 *
 * Phase N+2: add live exchange rate integration.
 * Currently uses the reference rates from normalizers/price.ts.
 */

import type { Currency } from '../types'

// ── Locale constants ──────────────────────────────────────────────────────────

const LOCALE_CO = 'es-CO'
const LOCALE_US = 'en-US'

// ── Core formatters ───────────────────────────────────────────────────────────

/**
 * Format a USD price for display.
 * Output: "$79.99", "$1,299.00", "$0.00"
 *
 * @param amount      - Numeric USD price
 * @param showCents   - Whether to show decimal places (default: true)
 * @returns Formatted USD string
 */
export function formatUSD(amount: number, showCents = true): string {
  if (!isFinite(amount)) return 'N/A'
  return new Intl.NumberFormat(LOCALE_US, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(amount)
}

/**
 * Format a COP price for display.
 * Output: "$ 1.299.000", "$ 79.000"
 * Note: COP does not use decimal places (no centavos in practice).
 *
 * @param amount - Numeric COP price
 * @returns Formatted COP string
 */
export function formatCOP(amount: number): string {
  if (!isFinite(amount)) return 'N/A'
  return new Intl.NumberFormat(LOCALE_CO, {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

/**
 * Format a price in any supported currency.
 *
 * @param amount   - Numeric price in the given currency
 * @param currency - Currency of the amount
 * @returns Formatted price string in the appropriate locale
 */
export function formatPrice(amount: number, currency: Currency): string {
  switch (currency) {
    case 'USD': return formatUSD(amount)
    case 'COP': return formatCOP(amount)
    case 'EUR':
      return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
      }).format(amount)
    default:
      return `${amount.toFixed(2)} ${currency}`
  }
}

/**
 * Format a USD price with a COP equivalent shown in parentheses.
 * Used for product cards where both prices are useful to the Colombian buyer.
 *
 * Output: "$79.99 (≈ $ 332.000 COP)"
 *
 * @param usdAmount   - Price in USD
 * @param usdToCopRate - Exchange rate (COP per 1 USD), defaults to reference rate
 * @returns Combined dual-currency display string
 */
export function formatDualCurrency(usdAmount: number, usdToCopRate = 4_150): string {
  if (!isFinite(usdAmount)) return 'N/A'
  const copAmount = Math.round(usdAmount * usdToCopRate)
  return `${formatUSD(usdAmount)} (≈ ${formatCOP(copAmount)})`
}

/**
 * Format a price range (e.g. for a product available at multiple retailers).
 * Output: "$39.99 – $79.99"
 *
 * @param minUSD - Lowest price in USD
 * @param maxUSD - Highest price in USD
 * @returns Formatted price range string
 */
export function formatPriceRange(minUSD: number, maxUSD: number): string {
  if (!isFinite(minUSD) || !isFinite(maxUSD)) return 'N/A'
  if (Math.abs(minUSD - maxUSD) < 0.01) return formatUSD(minUSD)
  return `${formatUSD(minUSD)} – ${formatUSD(maxUSD)}`
}

// ── Compact display ───────────────────────────────────────────────────────────

/**
 * Compact format for tight UI spaces (product cards, chips).
 * Rounds to nearest dollar and skips cents for amounts ≥ $10.
 *
 * Output examples:
 *   $0.99 → "$0.99"
 *   $9.99 → "$9.99"
 *   $39.99 → "$40"
 *   $299.99 → "$300"
 *   $1,299.99 → "$1.3k"
 */
export function formatUSDCompact(amount: number): string {
  if (!isFinite(amount)) return 'N/A'
  if (amount < 10) return formatUSD(amount)
  if (amount < 1_000) return `$${Math.round(amount)}`
  if (amount < 10_000) return `$${(amount / 1_000).toFixed(1)}k`
  return `$${Math.round(amount / 1_000)}k`
}

/**
 * Format the "savings" amount prominently.
 * Output: "Save $40.00" or "Ahorra $40.00"
 *
 * @param savingsUSD - Amount saved in USD
 * @param locale     - 'en' for English, 'es' for Spanish (default)
 */
export function formatSavingsAmount(savingsUSD: number, locale: 'en' | 'es' = 'es'): string {
  if (!isFinite(savingsUSD) || savingsUSD <= 0) return ''
  const amount = formatUSD(savingsUSD)
  return locale === 'es' ? `Ahorra ${amount}` : `Save ${amount}`
}

// ── Colombian import context ──────────────────────────────────────────────────

/**
 * Calculate the estimated total landed cost in Colombia for an Amazon purchase.
 * Includes product price + shipping + optional customs estimate.
 *
 * @param priceUSD        - Product price in USD
 * @param shippingUSD     - Estimated shipping cost in USD (default: $12)
 * @param includeCustoms  - Whether to add customs estimate for orders > $200
 * @returns Total landed cost in USD
 */
export function calculateLandedCostUSD(
  priceUSD: number,
  shippingUSD = 12,
  includeCustoms = false,
): number {
  if (!isFinite(priceUSD)) return NaN
  const total = priceUSD + shippingUSD

  // Colombian DIAN customs: ~10–15% on value above the $200 threshold
  if (includeCustoms && total > 200) {
    const dutiableAmount = total - 200
    const estimatedDuty = dutiableAmount * 0.15 // 15% conservative estimate
    return total + estimatedDuty
  }

  return total
}

/**
 * Format a total landed cost with breakdown for display.
 * Output: "$79.99 + $12 envío = $91.99"
 *
 * @param priceUSD    - Product price in USD
 * @param shippingUSD - Estimated shipping cost
 */
export function formatLandedCostBreakdown(priceUSD: number, shippingUSD = 12): string {
  const total = priceUSD + shippingUSD
  return `${formatUSD(priceUSD)} + ${formatUSD(shippingUSD)} envío = ${formatUSD(total)}`
}
