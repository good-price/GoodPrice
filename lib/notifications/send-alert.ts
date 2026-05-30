/**
 * GOODPRICE Notifications — Send Price Alert
 *
 * Orchestrates the full "alert triggered → email sent" pipeline:
 *   1. Cooldown check — skip if same subscription was emailed recently
 *   2. Build email payload from detection result + subscription
 *   3. Render HTML + plain-text templates
 *   4. Send via Resend
 *   5. Return structured result (sent / skipped / error)
 *
 * Called from POST /api/alerts/detect after detection confirms a trigger.
 *
 * Cooldown:
 *   Controlled by ALERT_COOLDOWN_HOURS env var (default: 24).
 *   Uses subscription.lastTriggeredAt to gate sends.
 *   Prevents spam when a price oscillates around a threshold.
 */

import type { AlertDetectionResult, AlertSubscription } from '@/lib/watchlist/types'
import { sendEmail, ResendSendError }                   from './resend'
import { buildPriceAlertHtml, buildPriceAlertText, buildPriceAlertSubject } from './templates/price-alert'

// ── Config ────────────────────────────────────────────────────────────────────

/** Default hours between consecutive alert emails for the same subscription. */
const DEFAULT_COOLDOWN_HOURS = 24

function getCooldownMs(): number {
  const val = parseInt(process.env.ALERT_COOLDOWN_HOURS ?? '', 10)
  const hours = Number.isFinite(val) && val > 0 ? val : DEFAULT_COOLDOWN_HOURS
  return hours * 60 * 60 * 1000
}

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
    ?? 'https://www.goodprice.co'
}

// ── Result type ───────────────────────────────────────────────────────────────

export type AlertSendStatus =
  | 'sent'
  | 'skipped_cooldown'
  | 'skipped_no_api_key'
  | 'error'

export interface AlertSendResult {
  subscriptionId: string
  email:          string
  status:         AlertSendStatus
  /** Resend email ID when status === 'sent' */
  emailId?:       string
  reason:         string
}

// ── Cooldown check ────────────────────────────────────────────────────────────

function isInCooldown(subscription: AlertSubscription): boolean {
  if (!subscription.lastTriggeredAt) return false
  const lastMs = new Date(subscription.lastTriggeredAt).getTime()
  if (isNaN(lastMs)) return false
  return (Date.now() - lastMs) < getCooldownMs()
}

// ── Main send function ────────────────────────────────────────────────────────

/**
 * Send a price alert email for a triggered detection result.
 *
 * Safe to call even when:
 *   - RESEND_API_KEY is missing (returns 'skipped_no_api_key')
 *   - Cooldown is active (returns 'skipped_cooldown')
 *   - Resend API errors (returns 'error', never throws)
 *
 * @param result       - Detection result (must have triggered === true)
 * @param subscription - Full subscription record for this result
 */
export async function sendPriceAlert(
  result:       AlertDetectionResult,
  subscription: AlertSubscription,
): Promise<AlertSendResult> {
  const base: Pick<AlertSendResult, 'subscriptionId' | 'email'> = {
    subscriptionId: result.subscriptionId,
    email:          result.email,
  }

  // Guard: RESEND_API_KEY must be present
  if (!process.env.RESEND_API_KEY) {
    return {
      ...base,
      status: 'skipped_no_api_key',
      reason: 'RESEND_API_KEY not configured — email skipped (set in .env.local)',
    }
  }

  // Guard: cooldown
  if (isInCooldown(subscription)) {
    const cooldownHours = getCooldownMs() / (60 * 60 * 1000)
    return {
      ...base,
      status: 'skipped_cooldown',
      reason: `Cooldown active (${cooldownHours}h). Last sent: ${subscription.lastTriggeredAt}`,
    }
  }

  // Build email payload
  const payload = {
    trigger:         subscription.trigger,
    productTitle:    subscription.productTitle,
    asin:            subscription.asin,
    currentPriceUSD: result.currentPriceUSD ?? 0,
    catalogPriceUSD: subscription.catalogPriceUSD,
    targetPriceUSD:  subscription.targetPriceUSD,
    subscriptionId:  subscription.id,
    siteUrl:         getSiteUrl(),
  }

  const subject = buildPriceAlertSubject({
    trigger:       subscription.trigger,
    productTitle:  subscription.productTitle,
    targetPriceUSD: subscription.targetPriceUSD,
  })

  try {
    const emailId = await sendEmail({
      to:      subscription.email,
      subject,
      html:    buildPriceAlertHtml(payload),
      text:    buildPriceAlertText(payload),
      tags: [
        { name: 'trigger',    value: subscription.trigger },
        { name: 'product_id', value: subscription.productId },
      ],
    })

    return {
      ...base,
      status:  'sent',
      emailId,
      reason:  `Email sent: ${subject}`,
    }
  } catch (err) {
    const message = err instanceof ResendSendError
      ? `Resend error ${err.statusCode}: ${err.resendError}`
      : err instanceof Error
      ? err.message
      : 'Unknown error'

    return {
      ...base,
      status: 'error',
      reason: message,
    }
  }
}

/**
 * Send alerts for all triggered results in a batch.
 * Subscriptions map must be keyed by subscription ID.
 *
 * Returns one AlertSendResult per triggered item.
 */
export async function sendPriceAlertBatch(
  results:           AlertDetectionResult[],
  subscriptionMap:   Map<string, AlertSubscription>,
): Promise<AlertSendResult[]> {
  const triggered = results.filter(r => r.triggered)
  if (triggered.length === 0) return []

  return Promise.all(
    triggered.map(result => {
      const subscription = subscriptionMap.get(result.subscriptionId)
      if (!subscription) {
        return Promise.resolve<AlertSendResult>({
          subscriptionId: result.subscriptionId,
          email:          result.email,
          status:         'error',
          reason:         'Subscription not found in batch map',
        })
      }
      return sendPriceAlert(result, subscription)
    }),
  )
}
