/**
 * lib/analytics/donations/types.ts
 *
 * Types for GOODPRICE donation analytics.
 * Tracks impressions (widget rendered) and clicks (Amazon CTA clicked).
 *
 * PROHIBITED: modal, popup, interstitial, fullscreen, blocking Amazon CTA.
 * SERVER-ONLY.
 */

export interface DonationProductStats {
  /** ASIN of the product linked to the SupportGoodPrice widget. */
  asin:        string
  /** Number of times the widget was rendered for this ASIN. */
  impressions: number
  /** Number of times the Amazon CTA was clicked for this ASIN. */
  clicks:      number
  /** ISO timestamp of the first impression recorded. */
  firstSeenAt: string
  /** ISO timestamp of the most recent event. */
  lastSeenAt:  string
}

export interface DonationsStore {
  updatedAt: string | null
  products:  Record<string, DonationProductStats>
}
