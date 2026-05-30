/**
 * GOODPRICE Pricing — Provider Registry
 *
 * Single point of access for all retailer provider instances.
 * Consumers never import provider files directly — they call getProvider()
 * or iterate PROVIDER_REGISTRY.
 *
 * Design goals:
 *   - Tree-shakeable: each provider is a separate file
 *   - Extensible: adding a new provider = one import + one Map.set()
 *   - Type-safe: registry is typed as Map<string, RetailerProvider>
 *
 * Adding a new retailer:
 *   1. Create lib/pricing/providers/[retailer].ts implementing RetailerProvider
 *   2. Import the provider singleton below
 *   3. Add to PROVIDER_REGISTRY
 *   4. Done — it's automatically available to all consumers
 *
 * Current providers (Phase 15):
 *   amazon       — primary; all catalog products live here
 *   mercadolibre — largest Colombian marketplace (future ML API)
 *   alkosto       — largest Colombian electronics chain (future scraper)
 *   falabella     — major Colombian retailer (future scraper)
 *   exito         — major Colombian retailer (future scraper)
 */

import type { RetailerProvider, ProviderRegistry, ProviderLookupResult } from './types'
import { amazonProvider }       from './amazon'
import { mercadoLibreProvider } from './mercadolibre'
import { alkostoProvider }      from './alkosto'
import { falabellaProvider }    from './falabella'
import { exitoProvider }        from './exito'

// ── Registry ──────────────────────────────────────────────────────────────────

export const PROVIDER_REGISTRY: ProviderRegistry = new Map<string, RetailerProvider>([
  ['amazon',       amazonProvider],
  ['mercadolibre', mercadoLibreProvider],
  ['alkosto',      alkostoProvider],
  ['falabella',    falabellaProvider],
  ['exito',        exitoProvider],
])

// ── Accessors ─────────────────────────────────────────────────────────────────

/**
 * Look up a provider by retailer ID.
 * Returns a discriminated union to force callers to handle the missing case.
 *
 * @example
 * const result = getProvider('amazon')
 * if (!result.found) throw new Error(result.reason)
 * const url = result.provider.buildAffiliateUrl(productUrl)
 */
export function getProvider(retailerId: string): ProviderLookupResult {
  const provider = PROVIDER_REGISTRY.get(retailerId)
  if (!provider) {
    return {
      found: false,
      reason: `No provider registered for retailer ID "${retailerId}". ` +
              `Known providers: ${Array.from(PROVIDER_REGISTRY.keys()).join(', ')}`,
    }
  }
  return { found: true, provider }
}

/**
 * Get a provider and throw if not found.
 * Use when the retailer ID is guaranteed to be valid (e.g. from a typed config).
 */
export function requireProvider(retailerId: string): RetailerProvider {
  const result = getProvider(retailerId)
  if (!result.found) throw new Error(result.reason)
  return result.provider
}

/** All registered providers as an array (useful for iteration) */
export function getAllProviders(): RetailerProvider[] {
  return Array.from(PROVIDER_REGISTRY.values())
}

/** All registered retailer IDs */
export function getAllRetailerIds(): string[] {
  return Array.from(PROVIDER_REGISTRY.keys())
}

/** All Retailer metadata objects from registered providers */
export function getAllRetailers() {
  return getAllProviders().map(p => p.retailer)
}

// ── Re-exports for convenience ────────────────────────────────────────────────

export { amazonProvider, mercadoLibreProvider, alkostoProvider, falabellaProvider, exitoProvider }
export type { RetailerProvider, ProviderRegistry, ProviderLookupResult } from './types'
