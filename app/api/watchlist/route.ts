/**
 * /api/watchlist
 *
 * POST — Create an email alert subscription for a tracked product.
 *        If a subscription already exists for (anonId + productId), updates it.
 *
 * GET  — List active subscriptions for a given anonId.
 *        Query: ?anonId=<id>
 *
 * Body (POST):
 *   anonId, email, productId, asin, productTitle,
 *   trigger, targetPriceUSD?, catalogPriceUSD
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  createSubscription,
  getSubscriptionsByAnonId,
  deactivateSubscription,
} from '@/lib/watchlist/alert-store'
import type { AlertTrigger } from '@/lib/watchlist/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── POST — create / update subscription ──────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    anonId, email, productId, asin, productTitle,
    trigger, targetPriceUSD, catalogPriceUSD,
  } = body

  // Validate required fields
  if (
    typeof anonId       !== 'string' || !anonId.trim() ||
    typeof email        !== 'string' || !email.trim() ||
    typeof productId    !== 'string' || !productId.trim() ||
    typeof asin         !== 'string' || !asin.trim() ||
    typeof productTitle !== 'string' || !productTitle.trim() ||
    typeof trigger      !== 'string' ||
    typeof catalogPriceUSD !== 'number'
  ) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  // Validate trigger type
  const validTriggers: AlertTrigger[] = ['any_drop', 'all_time_low', 'price_below']
  if (!validTriggers.includes(trigger as AlertTrigger)) {
    return NextResponse.json({ error: 'Trigger inválido' }, { status: 400 })
  }

  // price_below requires a target
  if (trigger === 'price_below') {
    if (typeof targetPriceUSD !== 'number' || targetPriceUSD <= 0) {
      return NextResponse.json({ error: 'Precio objetivo requerido para price_below' }, { status: 400 })
    }
    if (targetPriceUSD >= catalogPriceUSD) {
      return NextResponse.json({ error: 'El precio objetivo debe ser menor al precio actual' }, { status: 400 })
    }
  }

  try {
    // Deactivate any existing subscription for the same (anonId + productId) before creating
    const existing = await getSubscriptionsByAnonId(anonId.trim())
    const prev = existing.find(s => s.productId === productId && s.isActive)
    if (prev) {
      await deactivateSubscription(prev.id)
    }

    const subscription = await createSubscription({
      anonId:         anonId.trim(),
      email:          email.trim().toLowerCase(),
      productId:      productId.trim(),
      asin:           asin.trim(),
      productTitle:   productTitle.trim(),
      trigger:        trigger as AlertTrigger,
      targetPriceUSD: trigger === 'price_below' ? (targetPriceUSD as number) : undefined,
      catalogPriceUSD: catalogPriceUSD as number,
    })

    return NextResponse.json({ ok: true, subscription }, { status: 201 })
  } catch (err) {
    console.error('[api/watchlist POST]', err)
    return NextResponse.json({ error: 'Error interno al guardar la suscripción' }, { status: 500 })
  }
}

// ── GET — list subscriptions for an anonId ────────────────────────────────────

export async function GET(req: NextRequest) {
  const anonId = req.nextUrl.searchParams.get('anonId')?.trim()
  if (!anonId) {
    return NextResponse.json({ error: 'anonId requerido' }, { status: 400 })
  }

  try {
    const subscriptions = await getSubscriptionsByAnonId(anonId)
    return NextResponse.json({ ok: true, subscriptions })
  } catch (err) {
    console.error('[api/watchlist GET]', err)
    return NextResponse.json({ error: 'Error al obtener suscripciones' }, { status: 500 })
  }
}
