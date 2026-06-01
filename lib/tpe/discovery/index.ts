/**
 * lib/tpe/discovery/index.ts
 *
 * Public API for the Discovery Engine module.
 * Import from '@/lib/tpe/discovery' in scripts and future API routes.
 */

export * from './discovery-log'
export * from './vacancy-consumer'
export * from './candidate-builder'
export * from './deduplicator'
export type { DedupResult } from './discovery-types'
