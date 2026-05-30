/**
 * /api/audit/quarantine
 *
 * Manage the product quarantine list.
 *
 * GET    → list all quarantined products
 * POST   → add a product to quarantine
 * DELETE → remove a product from quarantine (restore)
 *
 * Auth: POST and DELETE require AUDIT_SECRET or CATALOG_VALIDATE_SECRET.
 *
 * POST body:
 * {
 *   productId:    string
 *   asin:         string
 *   title:        string
 *   category:     string
 *   reason:       string
 *   quarantinedBy?: 'manual' | 'audit'  // default: 'manual'
 *   score?:       number
 *   issues?:      string[]
 * }
 *
 * DELETE body:
 * { productId: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getQuarantine,
  quarantineProduct,
  unquarantineProduct,
} from '@/lib/audit/quarantine'
import { isAdminRequest } from '@/lib/admin/auth'

// ── GET: list all quarantined products ────────────────────────────────────────

export async function GET() {
  const store = getQuarantine()
  const entries = Object.values(store.entries)
  return NextResponse.json({
    updatedAt: store.updatedAt,
    count:     entries.length,
    entries,
  })
}

// ── POST: add to quarantine ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    productId:     string
    asin:          string
    title:         string
    category:      string
    reason:        string
    quarantinedBy?: 'manual' | 'audit'
    score?:        number
    issues?:       string[]
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { productId, asin, title, category, reason } = body

  if (!productId || !asin || !title || !category || !reason) {
    return NextResponse.json(
      { error: 'Required fields: productId, asin, title, category, reason' },
      { status: 400 }
    )
  }

  const entry = quarantineProduct({
    productId,
    asin,
    title,
    category,
    reason,
    quarantinedBy: body.quarantinedBy ?? 'manual',
    score:         body.score,
    issues:        body.issues,
  })

  return NextResponse.json({ message: 'Product quarantined', entry })
}

// ── DELETE: remove from quarantine ────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { productId: string }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.productId) {
    return NextResponse.json({ error: 'Required field: productId' }, { status: 400 })
  }

  const removed = unquarantineProduct(body.productId)

  if (!removed) {
    return NextResponse.json(
      { error: `Product "${body.productId}" is not quarantined` },
      { status: 404 }
    )
  }

  return NextResponse.json({ message: 'Product removed from quarantine', productId: body.productId })
}
