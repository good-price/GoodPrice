/**
 * AlertSetupSheet — Configure a price alert for a tracked product
 *
 * Client Component. Bottom sheet with three trigger options:
 *   1. Cualquier caída de precio (any_drop)
 *   2. Precio mínimo histórico  (all_time_low)
 *   3. Baje de $X              (price_below)
 *
 * Optional email field for server-side notifications (future Resend integration).
 * If no email provided: alert is configured client-side only (localStorage).
 * If email provided:    alert is also saved server-side via POST /api/watchlist.
 */

'use client'

import { useState } from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getAnonId } from '@/hooks/useWatchlist'
import type { AlertTrigger } from '@/lib/watchlist/types'

interface AlertSetupSheetProps {
  open:            boolean
  onClose:         () => void
  productId:       string
  asin:            string
  title:           string
  catalogPriceUSD: number
  currentAlert?: {
    trigger:    AlertTrigger
    targetUSD?: number
  }
  onAlertSaved: (
    alert: { trigger: AlertTrigger; targetUSD?: number },
    subscriptionId?: string,
  ) => void
}

const TRIGGER_OPTIONS: Array<{ value: AlertTrigger; label: string; description: string }> = [
  {
    value:       'any_drop',
    label:       'Cualquier caída de precio',
    description: 'Te aviso cuando el precio baje del promedio reciente',
  },
  {
    value:       'all_time_low',
    label:       'Precio mínimo histórico',
    description: 'Solo te aviso si alcanza el precio más bajo registrado',
  },
  {
    value:       'price_below',
    label:       'Baje de un precio específico',
    description: 'Tú decides el precio objetivo en USD',
  },
]

export function AlertSetupSheet({
  open, onClose,
  productId, asin, title, catalogPriceUSD,
  currentAlert, onAlertSaved,
}: AlertSetupSheetProps) {
  const [trigger, setTrigger]         = useState<AlertTrigger>(currentAlert?.trigger ?? 'any_drop')
  const [targetPrice, setTargetPrice] = useState<string>(
    currentAlert?.targetUSD?.toString() ?? '',
  )
  const [email, setEmail]             = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  const handleSave = async () => {
    setError('')

    // Validate price_below
    const targetUSD = trigger === 'price_below' ? parseFloat(targetPrice) : undefined
    if (trigger === 'price_below') {
      if (!targetPrice || isNaN(targetUSD!)) {
        setError('Ingresa un precio objetivo válido')
        return
      }
      if (targetUSD! >= catalogPriceUSD) {
        setError(`El precio objetivo debe ser menor a $${catalogPriceUSD.toFixed(2)}`)
        return
      }
    }

    // If no email → save client-side only
    if (!email.trim()) {
      onAlertSaved({ trigger, targetUSD }, undefined)
      return
    }

    // Validate email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Ingresa un email válido')
      return
    }

    // Save to server
    setSaving(true)
    try {
      const res = await fetch('/api/watchlist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          anonId:          getAnonId(),
          email:           email.trim().toLowerCase(),
          productId,
          asin,
          productTitle:    title,
          trigger,
          targetPriceUSD:  targetUSD,
          catalogPriceUSD,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al guardar la alerta')
        return
      }

      onAlertSaved({ trigger, targetUSD }, data.subscription?.id)
    } catch {
      setError('Error de conexión. La alerta se guardó localmente.')
      onAlertSaved({ trigger, targetUSD }, undefined)
    } finally {
      setSaving(false)
    }
  }

  const truncatedTitle = title.length > 45 ? `${title.slice(0, 45)}…` : title

  return (
    <Sheet open={open} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto px-6 py-6 sm:max-w-lg sm:mx-auto">
        <SheetHeader className="mb-5">
          <SheetTitle className="text-base font-bold text-gray-900">
            Configurar alerta
          </SheetTitle>
          <p className="text-sm text-gray-500 text-left leading-snug mt-1">
            {truncatedTitle}
          </p>
        </SheetHeader>

        {/* Trigger selection */}
        <fieldset className="mb-5">
          <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Avisarme cuando
          </legend>
          <div className="flex flex-col gap-2">
            {TRIGGER_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  trigger === opt.value
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="trigger"
                  value={opt.value}
                  checked={trigger === opt.value}
                  onChange={() => setTrigger(opt.value)}
                  className="mt-0.5 accent-amber-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Target price input (only for price_below) */}
        {trigger === 'price_below' && (
          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
              Precio objetivo (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <Input
                type="number"
                min="1"
                max={catalogPriceUSD - 1}
                step="0.01"
                placeholder={`p.ej. ${(catalogPriceUSD * 0.85).toFixed(0)}`}
                value={targetPrice}
                onChange={e => setTargetPrice(e.target.value)}
                className="pl-7"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Precio Amazon actual: ${catalogPriceUSD.toFixed(2)} — ingresa un valor menor
            </p>
          </div>
        )}

        {/* Email */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
            Tu email <span className="font-normal text-gray-400 normal-case tracking-normal">(opcional — para recibir notificaciones)</span>
          </label>
          <Input
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">
            Solo usamos tu email para este aviso. Sin spam, sin suscripciones.
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-500 mb-4 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[#F7A823] hover:bg-[#e8961a] text-black font-bold"
          >
            {saving ? 'Guardando…' : email.trim() ? 'Activar alerta con email' : 'Guardar alerta'}
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full text-gray-500 hover:text-gray-700"
          >
            Cancelar
          </Button>
        </div>

        {/* Link to watchlist */}
        <p className="text-center text-xs text-gray-400 mt-4">
          <a href="/seguimiento" className="hover:text-amber-600 underline underline-offset-2">
            Ver mis productos seguidos →
          </a>
        </p>
      </SheetContent>
    </Sheet>
  )
}
