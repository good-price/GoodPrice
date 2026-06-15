/**
 * DELETE /api/ops/products/delete
 *
 * Permanently deletes a product from the catalog and all operational stores.
 * This action is IRREVERSIBLE. The audit trail is preserved permanently.
 *
 * Auth: isAdminRequest() — session cookie or AUDIT_SECRET
 *
 * Body (JSON):
 * {
 *   productId:    string   — required
 *   confirmation: string   — required, must be exactly "ELIMINAR"
 *   reason:       string   — required (min 10 chars)
 *   operator?:    string   — default: "admin"
 * }
 *
 * Response 200:
 * {
 *   ok:            true
 *   productId:     string
 *   asin:          string
 *   title:         string
 *   storesCleared: string[]
 *   auditId:       string
 * }
 *
 * Errors:
 *   400 — missing/invalid fields, confirmation mismatch
 *   401 — unauthorized
 *   403 — RECALL_PROTECTED (CPSC recall — cannot delete without legal review)
 *   404 — product not found
 *   500 — internal error
 */

import { type NextRequest, NextResponse } from 'next/server'
import { revalidatePath }                 from 'next/cache'
import { isAdminRequest }                 from '@/lib/admin/auth'
import { performProductDeletion }         from '@/lib/ops/delete-product'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function DELETE(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const productId    = typeof body.productId    === 'string' ? body.productId.trim()    : ''
  const confirmation = typeof body.confirmation === 'string' ? body.confirmation.trim() : ''
  const reason       = typeof body.reason       === 'string' ? body.reason.trim()       : ''
  const operator     = typeof body.operator     === 'string' ? body.operator            : 'admin'

  // ── Field validation ────────────────────────────────────────────────────────
  if (!productId) {
    return NextResponse.json({ ok: false, error: 'productId es requerido' }, { status: 400 })
  }
  if (confirmation !== 'ELIMINAR') {
    return NextResponse.json(
      { ok: false, error: 'La confirmación debe ser exactamente "ELIMINAR"' },
      { status: 400 },
    )
  }
  if (reason.length < 10) {
    return NextResponse.json(
      { ok: false, error: 'El motivo debe tener al menos 10 caracteres' },
      { status: 400 },
    )
  }

  // ── Execute deletion ────────────────────────────────────────────────────────
  let result
  try {
    result = performProductDeletion({ productId, confirmation, operator, reason })
  } catch (e) {
    console.error('[delete-product] Unexpected error:', e)
    return NextResponse.json({ ok: false, error: 'Error interno del servidor' }, { status: 500 })
  }

  // ── Map errors to HTTP codes ────────────────────────────────────────────────
  if (!result.ok) {
    if (result.error === 'PRODUCT_NOT_FOUND') {
      return NextResponse.json({ ok: false, error: result.errorDetail }, { status: 404 })
    }
    if (result.error === 'RECALL_PROTECTED') {
      return NextResponse.json({ ok: false, error: result.errorDetail }, { status: 403 })
    }
    return NextResponse.json({ ok: false, error: result.errorDetail }, { status: 400 })
  }

  // ── Revalidate affected routes ──────────────────────────────────────────────
  try {
    revalidatePath('/',              'layout') // revalidates all cached pages
    revalidatePath('/admin/catalog')
    revalidatePath('/admin')
    revalidatePath('/productos')
  } catch { /* not in a request context — skip */ }

  // ── Success response ────────────────────────────────────────────────────────
  return NextResponse.json(
    {
      ok:            true,
      productId:     result.productId,
      asin:          result.asin,
      title:         result.title,
      category:      result.category,
      storesCleared: result.storesCleared,
      auditId:       result.auditId,
      message:       `"${result.title}" eliminado permanentemente. ${result.storesCleared.length} stores limpiados.`,
    },
    { status: 200 },
  )
}
