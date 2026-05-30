/**
 * Public API for the PA-API integration module.
 * Import from here — not from individual lib/paapi/* files.
 *
 * Usage:
 *   import { getPaapiClient, syncImages, getCacheStats } from '@/lib/paapi'
 */

export { getPaapiClient, PaapiClient, PaapiHttpError, IMAGE_RESOURCES } from './client'
export { getCached, setCached, clearCache, getCacheStats, getAllCachedSummaries } from './cache'
export { syncImages, getLastSyncLog, isImageStale, isImageFresh, countStaleImages } from './image-sync'
export { signPaapiRequest, PAAPI_URL } from './signing'
export type {
  PaapiGetItemsRequest,
  PaapiGetItemsResponse,
  PaapiItem,
  PaapiItemSummary,
  PaapiResource,
  PaapiImages,
  PaapiCacheEntry,
  PaapiSyncLog,
  PaapiSyncResult,
  PaapiSyncStatus,
} from './types'
export { extractSummary } from './types'
