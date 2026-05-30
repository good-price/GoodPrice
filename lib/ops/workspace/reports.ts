/**
 * lib/ops/workspace/reports.ts
 *
 * Public entry point for building the workspace OpsSnapshot.
 * Used by the layout (SSR) and the live API route (polling).
 *
 * SERVER-ONLY.
 */

export { buildOpsSnapshot, buildSectionCounts } from './realtime-engine'
export type { SectionCounts }                   from './realtime-engine'
