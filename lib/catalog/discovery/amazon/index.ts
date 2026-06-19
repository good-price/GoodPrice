/**
 * lib/catalog/discovery/amazon/index.ts
 *
 * Public API for the Amazon Discovery Engine — Sprint 4A.
 */

export type {
  AmazonSourceType,
  DiscoverySource,
  ScrapeResult,
  ParsedProduct,
  AmazonValidationResult,
  AmazonDiscoveryResult,
} from './types'

export { getCategoryDiscoverySources, getDiscoverableCategories } from './sources'
export { fetchDiscoverySource }                                   from './scraper'
export { parseDiscoveryHtml }                                     from './parser'
export { validateDiscoveryCandidates }                            from './validator'
export { runAmazonDiscovery }                                     from './pipeline'
