/**
 * lib/catalog/admission/index.ts
 *
 * Barrel exports for the Catalog Admission Engine (Sprint 3G).
 */

export type { AdmissionContext, AdmissionResult } from './types'
export { buildRuntimeProduct }    from './builder'
export { admitCatalogCandidates } from './admission'
