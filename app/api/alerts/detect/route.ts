/**
 * POST /api/alerts/detect
 *
 * Runs the alert detection batch for all active subscriptions (or a subset),
 * then sends email notifications via Resend for triggered alerts.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 *       Skipped in development (NODE_ENV !== 'production').
 *
 * Body (optional):
 *   { subscriptionIds?: string[] }
 *
 * Returns:
 *   {
 *     ok: true,
 *     total:     number,   // subscriptions checked
 *     triggered: number,   // conditions met
 *     sent:      number,   // emails sent
 *     skipped:   number,   // no price data
 *     results:   AlertDetectionResult[],
 *     emails:    AlertSendResult[],
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getActiveSubscriptions,
  getSubscription,
  markSubscriptionChecked,
} from '@/lib/watchlist/alert-store'
import { runDetectionBatch }    from '@/lib/watchlist/detection'
import { sendPriceAlertBatch }  from '@/lib/notifications/send-alert'
import { getPricingStore }       from '@/lib/pricing/store'
import type { AlertSubscription } from '@/lib/watchlist/types'
import { startJob, completeJob, failJob } from '@/lib/ops/job-logger'
import { jobLogger } from '@/lib/ops/logger'

const log = jobLogger('alert-detect')

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 120

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runId = startJob('alert-detect')
  let body: { subscriptionIds?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // Body is optional — proceed with all active subscriptions
  }

  const store = getPricingStore()

  // ── Resolve subscriptions ─────────────────────────────────────────────────

  let subscriptions: AlertSubscription[]
  try {
    if (Array.isArray(body.subscriptionIds) && body.subscriptionIds.length > 0) {
      const ids = body.subscriptionIds.filter(
        (id): id is string => typeof id === 'string',
      )
      const resolved = await Promise.all(ids.map(id => getSubscription(id)))
      subscriptions = resolved.filter(
        (s): s is AlertSubscription => s !== null && s.isActive,
      )
    } else {
      subscriptions = await getActiveSubscriptions()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('Failed to load subscriptions', { error: message })
    failJob('alert-detect', runId, message)
    return NextResponse.json({ error: 'Error al cargar suscripciones' }, { status: 500 })
  }

  if (subscriptions.length === 0) {
    completeJob('alert-detect', runId, { summary: '0 suscripciones activas' })
    return NextResponse.json({
      ok: true, total: 0, triggered: 0, sent: 0, skipped: 0, results: [], emails: [],
    })
  }

  // Index subscriptions by ID for O(1) lookup during email batch
  const subscriptionMap = new Map<string, AlertSubscription>(
    subscriptions.map(s => [s.id, s]),
  )

  // ── Fetch current prices ──────────────────────────────────────────────────

  const getPriceFn = async (productId: string): Promise<number | null> => {
    try {
      const offers = await store.getOffers(productId)
      // Best available offer: prefer Amazon, accept any non-discontinued retailer
      const best = offers
        .filter(
          o =>
            o.availability !== 'out_of_stock' &&
            o.availability !== 'discontinued',
        )
        .sort((a, b) => {
          // Amazon first, then by price ascending
          if (a.retailerId === 'amazon' && b.retailerId !== 'amazon') return -1
          if (b.retailerId === 'amazon' && a.retailerId !== 'amazon') return 1
          return a.priceUSD - b.priceUSD
        })[0]
      return best?.priceUSD ?? null
    } catch {
      return null
    }
  }

  const getSnapshotsFn = async (productId: string) => {
    try {
      // All snapshots — detection engine compares against previous records
      return await store.getSnapshots(productId)
    } catch {
      return []
    }
  }

  // ── Run detection ─────────────────────────────────────────────────────────

  let results
  try {
    results = await runDetectionBatch(subscriptions, getPriceFn, getSnapshotsFn)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('Detection batch failed', { error: message })
    failJob('alert-detect', runId, message)
    return NextResponse.json({ error: 'Error en detección' }, { status: 500 })
  }

  // ── Send emails for triggered alerts ──────────────────────────────────────

  const emailResults = await sendPriceAlertBatch(results, subscriptionMap)

  // Log outcomes
  for (const er of emailResults) {
    if (er.status === 'sent') {
      log.info('Email sent', { subscriptionId: er.subscriptionId, email: er.email, resendId: er.emailId })
    } else if (er.status === 'error') {
      log.error('Email error', { subscriptionId: er.subscriptionId, reason: er.reason })
    } else {
      log.info('Email skipped', { subscriptionId: er.subscriptionId, status: er.status })
    }
  }

  // ── Mark subscriptions checked ────────────────────────────────────────────
  // Only update lastTriggeredAt when email was actually sent
  // (cooldown gate means triggered ≠ emailed)

  const sentIds = new Set(
    emailResults
      .filter(er => er.status === 'sent')
      .map(er => er.subscriptionId),
  )

  await Promise.allSettled(
    results.map(result =>
      markSubscriptionChecked(
        result.subscriptionId,
        sentIds.has(result.subscriptionId), // true only when email went out
      ).catch(() => { /* don't fail response */ }),
    ),
  )

  // ── Build summary ─────────────────────────────────────────────────────────

  const triggered = results.filter(r => r.triggered).length
  const sent      = emailResults.filter(er => er.status === 'sent').length
  const skipped   = results.filter(r => !r.triggered && r.currentPriceUSD === undefined).length

  completeJob('alert-detect', runId, {
    summary: `${results.length} subs · ${triggered} triggered · ${sent} emails sent`,
    meta: { total: results.length, triggered, sent, skipped },
  })

  return NextResponse.json({
    ok: true,
    total:     results.length,
    triggered,
    sent,
    skipped,
    results,
    emails:    emailResults,
  })
}
