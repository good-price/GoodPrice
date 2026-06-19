/**
 * lib/catalog/discovery/amazon/sources.ts
 *
 * Maps each GOODPRICE category to a set of Amazon discovery source URLs.
 *
 * Rules:
 *   - Minimum 2 sources per category, maximum 4
 *   - Only amazon.com (US storefront)
 *   - No search results pages
 *   - Source types: best-sellers, new-releases, most-wished, movers-shakers
 *
 * NODE MAPPING (GOODPRICE slug → Amazon category path):
 *   bebes        → baby-products
 *   belleza      → beauty
 *   cocina       → kitchen
 *   deporte      → sporting-goods
 *   electronica  → electronics
 *   gaming       → videogames
 *   herramientas → tools
 *   hogar        → home
 *   mascotas     → pet-supplies
 *   oficina      → office-products
 */

import type { DiscoverySource } from './types'

// ── Base URL builder ──────────────────────────────────────────────────────────

const B = 'https://www.amazon.com'

function bs(node: string): string { return `${B}/Best-Sellers/zgbs/${node}/` }
function nr(node: string): string { return `${B}/gp/new-releases/${node}/` }
function mw(node: string): string { return `${B}/gp/most-wished-for/${node}/` }
function ms(node: string): string { return `${B}/gp/movers-and-shakers/${node}/` }

// ── Category source map ───────────────────────────────────────────────────────

const CATEGORY_SOURCES: Record<string, DiscoverySource[]> = {

  bebes: [
    { category: 'bebes', url: bs('baby-products'),     type: 'best-sellers'   },
    { category: 'bebes', url: nr('baby-products'),     type: 'new-releases'   },
    { category: 'bebes', url: mw('baby-products'),     type: 'most-wished'    },
  ],

  belleza: [
    { category: 'belleza', url: bs('beauty'),          type: 'best-sellers'   },
    { category: 'belleza', url: nr('beauty'),          type: 'new-releases'   },
    { category: 'belleza', url: mw('beauty'),          type: 'most-wished'    },
    { category: 'belleza', url: ms('beauty'),          type: 'movers-shakers' },
  ],

  cocina: [
    { category: 'cocina', url: bs('kitchen'),          type: 'best-sellers'   },
    { category: 'cocina', url: nr('kitchen'),          type: 'new-releases'   },
    { category: 'cocina', url: mw('kitchen'),          type: 'most-wished'    },
  ],

  deporte: [
    { category: 'deporte', url: bs('sporting-goods'),  type: 'best-sellers'   },
    { category: 'deporte', url: nr('sporting-goods'),  type: 'new-releases'   },
    { category: 'deporte', url: mw('sporting-goods'),  type: 'most-wished'    },
    { category: 'deporte', url: ms('sporting-goods'),  type: 'movers-shakers' },
  ],

  electronica: [
    { category: 'electronica', url: bs('electronics'), type: 'best-sellers'   },
    { category: 'electronica', url: nr('electronics'), type: 'new-releases'   },
    { category: 'electronica', url: mw('electronics'), type: 'most-wished'    },
    { category: 'electronica', url: ms('electronics'), type: 'movers-shakers' },
  ],

  gaming: [
    { category: 'gaming', url: bs('videogames'),       type: 'best-sellers'   },
    { category: 'gaming', url: nr('videogames'),       type: 'new-releases'   },
    { category: 'gaming', url: mw('videogames'),       type: 'most-wished'    },
    { category: 'gaming', url: ms('videogames'),       type: 'movers-shakers' },
  ],

  herramientas: [
    { category: 'herramientas', url: bs('tools'),      type: 'best-sellers'   },
    { category: 'herramientas', url: nr('tools'),      type: 'new-releases'   },
    { category: 'herramientas', url: mw('tools'),      type: 'most-wished'    },
  ],

  hogar: [
    { category: 'hogar', url: bs('home'),              type: 'best-sellers'   },
    { category: 'hogar', url: nr('home'),              type: 'new-releases'   },
    { category: 'hogar', url: mw('home'),              type: 'most-wished'    },
    { category: 'hogar', url: ms('home'),              type: 'movers-shakers' },
  ],

  mascotas: [
    { category: 'mascotas', url: bs('pet-supplies'),   type: 'best-sellers'   },
    { category: 'mascotas', url: nr('pet-supplies'),   type: 'new-releases'   },
    { category: 'mascotas', url: mw('pet-supplies'),   type: 'most-wished'    },
  ],

  oficina: [
    { category: 'oficina', url: bs('office-products'), type: 'best-sellers'   },
    { category: 'oficina', url: nr('office-products'), type: 'new-releases'   },
    { category: 'oficina', url: mw('office-products'), type: 'most-wished'    },
  ],
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the list of Amazon discovery sources for the given GOODPRICE category.
 * Returns an empty array for unknown categories (never throws).
 */
export function getCategoryDiscoverySources(category: string): DiscoverySource[] {
  return CATEGORY_SOURCES[category] ?? []
}

/** Returns all known discoverable categories. */
export function getDiscoverableCategories(): string[] {
  return Object.keys(CATEGORY_SOURCES)
}
