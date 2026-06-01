/**
 * lib/tpe/discovery/discovery-types.ts
 *
 * Sprint 5A — Discovery Lite
 *
 * Re-exports the global Discovery types from @/types and defines
 * module-internal types used exclusively within lib/tpe/discovery/.
 */

// ── Re-export global types ────────────────────────────────────────────────────

export type {
  DiscoverySource,
  DiscoveryJobStatus,
  DiscoveryCandidate,
  DiscoveryCategoryResult,
  DiscoveryJob,
  DiscoveryResult,
  DiscoveryLogStore,
} from '@/types'

// ── Module-internal types ─────────────────────────────────────────────────────

/**
 * Result of the deduplicator's filter pass.
 * `passed`  — ASINs cleared for CandidateRecord construction
 * `blocked` — ASINs rejected with the dedup reason and a human-readable detail
 */
export interface DedupResult {
  passed:  string[]
  blocked: Array<{
    asin:   string
    reason: 'asin' | 'title'
    detail: string
  }>
}
