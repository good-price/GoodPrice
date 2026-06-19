/**
 * lib/catalog/discovery/amazon/types.ts
 *
 * Types for the Amazon Discovery Engine — Sprint 4A.
 *
 * These types describe the Amazon scraping pipeline: sources → scrape →
 * parse → validate → save to candidate store. They are internal to the
 * amazon/ module. Consumers receive DiscoveryCandidate[] (from the shared
 * candidate store) or AmazonDiscoveryResult (pipeline summary).
 */

// ── Source descriptor ─────────────────────────────────────────────────────────

export type AmazonSourceType = 'best-sellers' | 'new-releases' | 'most-wished' | 'movers-shakers'

export interface DiscoverySource {
  /** GOODPRICE category slug. */
  category: string
  /** Full Amazon URL to scrape. */
  url: string
  /** Which Amazon list this URL represents. */
  type: AmazonSourceType
}

// ── Scraper result ────────────────────────────────────────────────────────────

export interface ScrapeResult {
  success:    boolean
  html:       string
  status:     number
  durationMs: number
  source:     DiscoverySource
  error?:     string
}

// ── Parser output (internal, before DiscoveryCandidate conversion) ────────────

export interface ParsedProduct {
  asin:        string
  title:       string
  image:       string | null
  price:       number
  rating:      number
  reviews:     number
  brand?:      string       // Sprint 4B: enriched from title extraction
  sourceUrl:   string
  sourceType:  AmazonSourceType
  discoveredAt: string
}

// ── Validator output ──────────────────────────────────────────────────────────

export interface AmazonValidationResult {
  candidates:    ParsedProduct[]
  rejected:      number
  rejectedAsins: string[]  // Sprint 4B: valid ASINs rejected on quality criteria
  errors:        string[]
}

// ── Pipeline result (returned by runAmazonDiscovery) ─────────────────────────

export interface AmazonDiscoveryResult {
  category:   string
  sources:    number
  scraped:    number
  parsed:     number
  validated:  number
  saved:      number
  errors:     string[]
  durationMs: number
}
