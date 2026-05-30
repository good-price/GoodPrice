/**
 * DELETE /api/watchlist/[id]
 *
 * Deactivates (soft-deletes) an alert subscription.
 * Requires matching anonId in the request body to prevent unauthorized deletion.
 *
 * Body: { anonId: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getSubscription,
  deactivateSubscription,
} from '@/lib/watchlist/alert-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params
  if (!id?.trim()) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { anonId } = body
  if (typeof anonId !== 'string' || !anonId.trim()) {
    return NextResponse.json({ error: 'anonId requerido' }, { status: 400 })
  }

  try {
    const subscription = await getSubscription(id.trim())

    if (!subscription) {
      return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
    }

    // Ownership check — only the original anonymous user can delete
    if (subscription.anonId !== anonId.trim()) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    if (!subscription.isActive) {
      // Already inactive — return success (idempotent)
      return NextResponse.json({ ok: true, message: 'Ya estaba inactiva' })
    }

    await deactivateSubscription(id.trim())
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/watchlist DELETE]', err)
    return NextResponse.json({ error: 'Error al desactivar la suscripción' }, { status: 500 })
  }
}
