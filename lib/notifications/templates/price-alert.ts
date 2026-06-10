/**
 * GOODPRICE Email Templates — Price Alert
 *
 * Generates HTML + plain-text email content for the three alert trigger types:
 *   - any_drop      → price fell significantly from reference
 *   - all_time_low  → price hit a new historical minimum
 *   - price_below   → price crossed the user's custom target
 *
 * Design principles:
 *   - Inline CSS only (email client compatibility)
 *   - Mobile-first, single-column layout
 *   - Minimal — no heavy imagery, loads fast
 *   - Affiliate links always use buildAsinUrl() → upgoodprice-20 tag
 *   - Unsubscribe link in footer (CAN-SPAM compliant)
 */

import type { AlertTrigger } from '@/lib/watchlist/types'
import { buildAsinUrl } from '@/lib/affiliate'

// ── Palette (mirrors site colors) ────────────────────────────────────────────

const AMBER  = '#F7A823'
const DARK   = '#1a1f2e'
const GREEN  = '#059669'
const GRAY   = '#6b7280'
const LIGHT  = '#f9fafb'

// ── Payload ───────────────────────────────────────────────────────────────────

export interface PriceAlertEmailPayload {
  trigger:          AlertTrigger
  productTitle:     string
  asin:             string
  currentPriceUSD:  number
  catalogPriceUSD:  number   // Amazon reference price
  targetPriceUSD?:  number   // only for price_below
  subscriptionId:   string
  /** Full base URL of the site, e.g. https://www.goodprice.co */
  siteUrl:          string
}

// ── Content helpers ───────────────────────────────────────────────────────────

function pct(from: number, to: number): string {
  const p = Math.round(((from - to) / from) * 100)
  return `${p}%`
}

interface AlertContent {
  subject:    string
  headline:   string
  subheadline: string
  badgeText:  string
  badgeColor: string
}

function resolveContent(p: PriceAlertEmailPayload): AlertContent {
  const short = p.productTitle.length > 50
    ? `${p.productTitle.slice(0, 50)}…`
    : p.productTitle

  switch (p.trigger) {
    case 'all_time_low':
      return {
        subject:      `🎯 Mínimo histórico: ${short}`,
        headline:     '🎯 ¡Precio mínimo histórico!',
        subheadline:  `${short} nunca había estado tan barato en Colombia.`,
        badgeText:    'Mínimo histórico',
        badgeColor:   GREEN,
      }

    case 'price_below':
      return {
        subject:     `🔔 Alerta activada: ${short} bajó de $${p.targetPriceUSD?.toFixed(2)}`,
        headline:    '🔔 ¡Tu precio objetivo alcanzado!',
        subheadline: `${short} cruzó el precio que pediste.`,
        badgeText:   `< $${p.targetPriceUSD?.toFixed(2)} USD`,
        badgeColor:  AMBER,
      }

    case 'any_drop':
    default:
      return {
        subject:     `📉 Bajó el precio: ${short}`,
        headline:    '📉 Caída de precio detectada',
        subheadline: `${short} bajó ${pct(p.catalogPriceUSD, p.currentPriceUSD)} respecto al precio de referencia.`,
        badgeText:   `−${pct(p.catalogPriceUSD, p.currentPriceUSD)} vs Amazon`,
        badgeColor:  GREEN,
      }
  }
}

// ── HTML template ─────────────────────────────────────────────────────────────

export function buildPriceAlertHtml(p: PriceAlertEmailPayload): string {
  const c = resolveContent(p)
  const affiliateUrl  = buildAsinUrl(p.asin)
  const productPageUrl = `${p.siteUrl}/productos/${p.asin}`
  const unsubscribeUrl = `${p.siteUrl}/cancelar/${p.subscriptionId}`

  const savings = p.catalogPriceUSD > p.currentPriceUSD
    ? `$${(p.catalogPriceUSD - p.currentPriceUSD).toFixed(2)} menos que Amazon`
    : null

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${c.subject}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <!-- Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Card -->
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

          <!-- Header bar -->
          <tr>
            <td style="background:${DARK};padding:20px 28px;">
              <span style="font-size:20px;font-weight:900;color:#ffffff;letter-spacing:-.5px;">
                GOOD<span style="color:${AMBER};">PRICE</span>
              </span>
              <span style="display:block;font-size:11px;color:rgba(255,255,255,.45);margin-top:2px;letter-spacing:.5px;text-transform:uppercase;">
                Alerta de precio
              </span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 28px 20px;">

              <!-- Headline -->
              <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:${DARK};line-height:1.2;">
                ${c.headline}
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:${GRAY};line-height:1.5;">
                ${c.subheadline}
              </p>

              <!-- Product name -->
              <div style="background:${LIGHT};border-radius:10px;padding:14px 16px;margin-bottom:20px;">
                <p style="margin:0;font-size:13px;font-weight:600;color:${DARK};line-height:1.4;">
                  ${p.productTitle}
                </p>
              </div>

              <!-- Price comparison -->
              <table role="presentation" width="100%" style="margin-bottom:24px;">
                <tr>
                  <!-- ML Colombia price -->
                  <td style="text-align:center;padding:16px 12px;background:${LIGHT};border-radius:10px;width:48%;">
                    <div style="font-size:11px;color:${GRAY};margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px;">En Colombia</div>
                    <div style="font-size:28px;font-weight:900;color:${GREEN};">
                      $${p.currentPriceUSD.toFixed(2)}
                    </div>
                    <div style="font-size:11px;color:${GRAY};margin-top:2px;">USD</div>
                    <!-- Badge -->
                    <div style="display:inline-block;margin-top:8px;background:${c.badgeColor};color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;letter-spacing:.3px;">
                      ${c.badgeText}
                    </div>
                  </td>

                  <td style="width:4%;text-align:center;color:${GRAY};font-size:18px;">vs</td>

                  <!-- Amazon reference price -->
                  <td style="text-align:center;padding:16px 12px;background:${LIGHT};border-radius:10px;width:48%;">
                    <div style="font-size:11px;color:${GRAY};margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px;">Amazon</div>
                    <div style="font-size:22px;font-weight:700;color:#9ca3af;text-decoration:line-through;">
                      $${p.catalogPriceUSD.toFixed(2)}
                    </div>
                    <div style="font-size:11px;color:${GRAY};margin-top:2px;">USD catálogo</div>
                  </td>
                </tr>
              </table>

              ${savings ? `
              <!-- Savings callout -->
              <p style="margin:0 0 24px;text-align:center;font-size:13px;font-weight:700;color:${GREEN};">
                ✅ ${savings}
              </p>` : ''}

              <!-- Primary CTA -->
              <table role="presentation" width="100%">
                <tr>
                  <td align="center" style="padding-bottom:12px;">
                    <a href="${affiliateUrl}"
                       style="display:inline-block;background:${AMBER};color:#000000;font-size:15px;font-weight:800;text-decoration:none;padding:14px 32px;border-radius:10px;letter-spacing:-.2px;">
                      Ver en Amazon →
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <a href="${productPageUrl}"
                       style="font-size:12px;color:${GRAY};text-decoration:underline;">
                      Ver comparativa completa en GOODPRICE
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 28px;">
              <div style="border-top:1px solid #e5e7eb;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 28px 24px;">
              <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;text-align:center;">
                Recibiste este correo porque activaste una alerta en
                <a href="${p.siteUrl}" style="color:${AMBER};text-decoration:none;">GOODPRICE</a>.<br>
                Como afiliado de Amazon, ganamos comisión por compras calificadas.<br>
                <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">
                  Cancelar esta alerta
                </a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function buildPriceAlertText(p: PriceAlertEmailPayload): string {
  const c = resolveContent(p)
  const affiliateUrl   = buildAsinUrl(p.asin)
  const productPageUrl = `${p.siteUrl}/productos/${p.asin}`
  const unsubscribeUrl = `${p.siteUrl}/cancelar/${p.subscriptionId}`

  const savings = p.catalogPriceUSD > p.currentPriceUSD
    ? `Ahorras $${(p.catalogPriceUSD - p.currentPriceUSD).toFixed(2)} vs Amazon`
    : ''

  return [
    `GOODPRICE — Alerta de precio`,
    ``,
    c.headline,
    c.subheadline,
    ``,
    `Producto: ${p.productTitle}`,
    ``,
    `Precio en Colombia: $${p.currentPriceUSD.toFixed(2)} USD`,
    `Precio Amazon:      $${p.catalogPriceUSD.toFixed(2)} USD`,
    savings,
    ``,
    `Ver en Amazon: ${affiliateUrl}`,
    `Comparativa en GOODPRICE: ${productPageUrl}`,
    ``,
    `---`,
    `Cancelar esta alerta: ${unsubscribeUrl}`,
    `Como afiliado de Amazon, GOODPRICE gana comisión por compras calificadas.`,
  ].filter(line => line !== undefined).join('\n')
}

// ── Subject line (exported separately for logging) ────────────────────────────

export function buildPriceAlertSubject(p: Pick<PriceAlertEmailPayload, 'trigger' | 'productTitle' | 'targetPriceUSD'>): string {
  const short = p.productTitle.length > 50
    ? `${p.productTitle.slice(0, 50)}…`
    : p.productTitle

  switch (p.trigger) {
    case 'all_time_low': return `🎯 Mínimo histórico: ${short}`
    case 'price_below':  return `🔔 Alerta activada: ${short}`
    case 'any_drop':
    default:             return `📉 Bajó el precio: ${short}`
  }
}
