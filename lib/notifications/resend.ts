/**
 * GOODPRICE Notifications — Resend API Client
 *
 * Thin wrapper around Resend's HTTP API.
 * Uses native fetch — no SDK dependency.
 *
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 *
 * Environment variables required:
 *   RESEND_API_KEY   — Resend API key (re_...)
 *   RESEND_FROM_EMAIL — Verified sender address (e.g. alertas@goodprice.co)
 */

const RESEND_API_URL = 'https://api.resend.com/emails'

export interface ResendEmailPayload {
  to:      string | string[]
  subject: string
  html:    string
  text?:   string  // plain-text fallback (recommended for deliverability)
  replyTo?: string
  tags?:   Array<{ name: string; value: string }>
}

export interface ResendEmailResponse {
  id: string
}

export interface ResendError {
  name:    string
  message: string
  statusCode: number
}

export class ResendSendError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly resendError: string,
  ) {
    super(message)
    this.name = 'ResendSendError'
  }
}

/**
 * Send an email via Resend.
 *
 * Throws `ResendSendError` on API errors.
 * Throws a generic `Error` if the API key is not configured.
 *
 * @param payload - Email content and recipient
 * @returns Resend email ID (useful for logging)
 */
export async function sendEmail(payload: ResendEmailPayload): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY
  const from   = process.env.RESEND_FROM_EMAIL ?? 'GOODPRICE <alertas@goodprice.co>'

  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is not configured. Set it in .env.local to send emails.',
    )
  }

  const body = {
    from,
    to:       Array.isArray(payload.to) ? payload.to : [payload.to],
    subject:  payload.subject,
    html:     payload.html,
    text:     payload.text,
    reply_to: payload.replyTo,
    tags:     payload.tags,
  }

  const res = await fetch(RESEND_API_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}`
    try {
      const err = (await res.json()) as ResendError
      errorMessage = err.message ?? errorMessage
    } catch { /* ignore parse errors */ }

    throw new ResendSendError(
      `Resend API error: ${errorMessage}`,
      res.status,
      errorMessage,
    )
  }

  const data = (await res.json()) as ResendEmailResponse
  return data.id
}
