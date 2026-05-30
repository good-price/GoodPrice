/**
 * Amazon Product Advertising API 5.0 — Type definitions
 *
 * Covers: GetItems request/response, cache entries, sync log.
 * Reference: https://webservices.amazon.com/paapi5/documentation/
 */

// ── Request ────────────────────────────────────────────────────────────────────

export type PaapiResource =
  | 'Images.Primary.Large'
  | 'Images.Primary.Medium'
  | 'Images.Primary.Small'
  | 'Images.Variants.Large'
  | 'ItemInfo.Title'
  | 'ItemInfo.Features'
  | 'ItemInfo.ByLineInfo'
  | 'ItemInfo.ProductInfo'
  | 'Offers.Listings.Price'
  | 'Offers.Listings.Availability.Type'
  | 'Offers.Summaries.LowestPrice'
  | 'ParentASIN'

export interface PaapiGetItemsRequest {
  ItemIds: string[]
  Resources: PaapiResource[]
  PartnerTag: string
  PartnerType: 'Associates'
  Marketplace: string
  Condition?: 'New' | 'Used' | 'Collectible' | 'Refurbished' | 'All'
}

// ── Response ───────────────────────────────────────────────────────────────────

export interface PaapiImage {
  URL: string
  Height: number
  Width: number
}

export interface PaapiImages {
  Primary?: {
    Large?: PaapiImage
    Medium?: PaapiImage
    Small?: PaapiImage
  }
  Variants?: Array<{
    Large?: PaapiImage
    Medium?: PaapiImage
    Small?: PaapiImage
  }>
}

export interface PaapiItemInfo {
  Title?: {
    DisplayValue: string
    Label: string
    Locale: string
  }
  Features?: {
    DisplayValues: string[]
    Label: string
    Locale: string
  }
  ByLineInfo?: {
    Brand?: { DisplayValue: string; Label: string; Locale: string }
    Manufacturer?: { DisplayValue: string; Label: string; Locale: string }
  }
}

export interface PaapiOfferListing {
  Price?: {
    Amount: number
    Currency: string
    DisplayAmount: string
  }
  Availability?: {
    Type: string
    MinOrderQuantity?: number
  }
}

export interface PaapiOffers {
  Listings?: PaapiOfferListing[]
  Summaries?: Array<{
    LowestPrice?: {
      Amount: number
      Currency: string
      DisplayAmount: string
    }
    Condition?: { Value: string; DisplayValue: string }
  }>
}

export interface PaapiItem {
  ASIN: string
  DetailPageURL: string
  Images?: PaapiImages
  ItemInfo?: PaapiItemInfo
  Offers?: PaapiOffers
  ParentASIN?: string
}

export interface PaapiGetItemsResponse {
  ItemsResult?: {
    Items: PaapiItem[]
  }
  Errors?: Array<{
    Code: string
    Message: string
  }>
}

// ── Derived / enriched ─────────────────────────────────────────────────────────

/** Clean summary extracted from a PA-API item — used in sync and admin */
export interface PaapiItemSummary {
  asin: string
  title?: string
  brand?: string
  imageUrl?: string
  imageWidth?: number
  imageHeight?: number
  price?: number
  currency?: string
  available?: boolean
  detailPageUrl?: string
}

export function extractSummary(item: PaapiItem): PaapiItemSummary {
  const large = item.Images?.Primary?.Large
  const listing = item.Offers?.Listings?.[0]
  return {
    asin: item.ASIN,
    title: item.ItemInfo?.Title?.DisplayValue,
    brand:
      item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue ??
      item.ItemInfo?.ByLineInfo?.Manufacturer?.DisplayValue,
    imageUrl: large?.URL,
    imageWidth: large?.Width,
    imageHeight: large?.Height,
    price: listing?.Price?.Amount,
    currency: listing?.Price?.Currency,
    available: listing?.Availability?.Type === 'Now',
    detailPageUrl: item.DetailPageURL,
  }
}

// ── Cache ──────────────────────────────────────────────────────────────────────

export interface PaapiCacheEntry {
  asin: string
  fetchedAt: string    // ISO
  expiresAt: string    // ISO
  item: PaapiItem | null
  summary: PaapiItemSummary | null
  error?: string
}

// ── Sync log ───────────────────────────────────────────────────────────────────

export type PaapiSyncStatus =
  | 'updated'    // image URL patched in catalog file
  | 'unchanged'  // PA-API returned same URL already in catalog
  | 'no_image'   // item found but no image URL
  | 'api_error'  // PA-API error or item not returned
  | 'from_cache' // served from local cache — not a fresh API call

export interface PaapiSyncResult {
  asin: string
  productId: string
  status: PaapiSyncStatus
  oldUrl?: string
  newUrl?: string
  error?: string
}

export interface PaapiSyncLog {
  runId: string
  startedAt: string
  completedAt: string
  durationMs: number
  totalTargets: number
  updated: number
  unchanged: number
  noImage: number
  errors: number
  fromCache: number
  results: PaapiSyncResult[]
}
