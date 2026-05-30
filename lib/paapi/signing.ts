/**
 * AWS Signature Version 4 for PA-API 5.0
 *
 * PA-API uses standard AWS Sig V4 with these specifics:
 *   - Service:  ProductAdvertisingAPI
 *   - Region:   us-east-1
 *   - Endpoint: webservices.amazon.com
 *   - Path:     /paapi5/getitems
 *   - Target:   com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems
 *   - Content-Encoding: amz-1.0  (PA-API specific — mandatory)
 *
 * Reference: https://webservices.amazon.com/paapi5/documentation/sending-request.html
 */

import { createHmac, createHash } from 'crypto'

// ── Constants ──────────────────────────────────────────────────────────────────

const SERVICE  = 'ProductAdvertisingAPI'
const REGION   = 'us-east-1'
const HOST     = 'webservices.amazon.com'
const PATH     = '/paapi5/getitems'
const TARGET   = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems'

// ── Low-level crypto helpers ───────────────────────────────────────────────────

function sha256hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex')
}

function hmac256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

function hmac256hex(key: Buffer | string, data: string): string {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex')
}

// ── Signing key derivation ─────────────────────────────────────────────────────

function deriveSigningKey(secretKey: string, dateStamp: string): Buffer {
  const kDate    = hmac256('AWS4' + secretKey, dateStamp)
  const kRegion  = hmac256(kDate, REGION)
  const kService = hmac256(kRegion, SERVICE)
  const kSigning = hmac256(kService, 'aws4_request')
  return kSigning
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const PAAPI_URL = `https://${HOST}${PATH}` as const

export interface SignedRequest {
  url: string
  headers: Record<string, string>
}

/**
 * Sign a PA-API GetItems request using AWS Signature V4.
 *
 * @param accessKey  PA-API access key (from Amazon Associates)
 * @param secretKey  PA-API secret key
 * @param payload    JSON stringified request body
 * @param timestamp  Request timestamp (defaults to now)
 */
export function signPaapiRequest(
  accessKey: string,
  secretKey: string,
  payload: string,
  timestamp: Date = new Date(),
): SignedRequest {
  // ── 1. Date strings ────────────────────────────────────────────────────────
  const amzDate  = timestamp.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'  // 20260527T123456Z
  const dateStamp = amzDate.substring(0, 8)                                           // 20260527

  const contentType = 'application/json; charset=utf-8'
  const payloadHash = sha256hex(payload)

  // ── 2. Canonical headers (sorted alphabetically by header name) ────────────
  // PA-API requires: content-encoding, content-type, host, x-amz-date, x-amz-target
  const canonicalHeadersStr =
    `content-encoding:amz-1.0\n` +
    `content-type:${contentType}\n` +
    `host:${HOST}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${TARGET}\n`

  const signedHeadersStr = 'content-encoding;content-type;host;x-amz-date;x-amz-target'

  // ── 3. Canonical request ───────────────────────────────────────────────────
  const canonicalRequest = [
    'POST',
    PATH,
    '',              // no query string
    canonicalHeadersStr,
    signedHeadersStr,
    payloadHash,
  ].join('\n')

  // ── 4. String to sign ──────────────────────────────────────────────────────
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join('\n')

  // ── 5. Signature ───────────────────────────────────────────────────────────
  const signingKey = deriveSigningKey(secretKey, dateStamp)
  const signature  = hmac256hex(signingKey, stringToSign)

  // ── 6. Authorization header ────────────────────────────────────────────────
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeadersStr}, ` +
    `Signature=${signature}`

  return {
    url: PAAPI_URL,
    headers: {
      'Content-Encoding': 'amz-1.0',
      'Content-Type': contentType,
      'Host': HOST,
      'X-Amz-Date': amzDate,
      'X-Amz-Target': TARGET,
      'Authorization': authorization,
    },
  }
}
