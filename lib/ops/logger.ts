/**
 * GOODPRICE Structured Logger
 *
 * Replaces ad-hoc console.log across all server-side code.
 *
 * Behavior:
 *   development  → colored, human-readable console output
 *   production   → structured JSON (one object per line)
 *                  Vercel log viewer parses these automatically and makes
 *                  them filterable/searchable by field.
 *
 * Usage:
 *   import { logger } from '@/lib/ops/logger'
 *   logger.info('job started', { job: 'audit', products: 200 })
 *   logger.warn('api slow', { ms: 4500, endpoint: 'paapi' })
 *   logger.error('job failed', { job: 'price-check', error: err.message })
 *
 * Log fields (always present):
 *   ts       — ISO timestamp
 *   level    — 'debug' | 'info' | 'warn' | 'error'
 *   msg      — human-readable message
 *   [ctx]    — any additional structured fields
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogContext = Record<string, unknown>

const IS_PROD = process.env.NODE_ENV === 'production'

// ── ANSI colors (dev only) ────────────────────────────────────────────────────

const C: Record<LogLevel, string> = {
  debug: '\x1b[90m',   // gray
  info:  '\x1b[36m',   // cyan
  warn:  '\x1b[33m',   // yellow
  error: '\x1b[31m',   // red
}
const RESET = '\x1b[0m'
const BOLD  = '\x1b[1m'

// ── Core emit function ────────────────────────────────────────────────────────

function emit(level: LogLevel, msg: string, ctx?: LogContext): void {
  if (IS_PROD) {
    // Structured JSON — one line, picked up by Vercel log viewer
    const entry: Record<string, unknown> = {
      ts:  new Date().toISOString(),
      level,
      msg,
      ...ctx,
    }
    if (level === 'error') {
      console.error(JSON.stringify(entry))
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry))
    } else {
      console.log(JSON.stringify(entry))
    }
  } else {
    // Colored human-readable for local dev
    const prefix = `${C[level]}${BOLD}[${level.toUpperCase()}]${RESET}`
    const ts     = `\x1b[90m${new Date().toISOString().slice(11, 23)}\x1b[0m`
    const ctxStr = ctx && Object.keys(ctx).length > 0
      ? ` ${JSON.stringify(ctx)}`
      : ''

    if (level === 'error') {
      console.error(`${ts} ${prefix} ${msg}${ctxStr}`)
    } else if (level === 'warn') {
      console.warn(`${ts} ${prefix} ${msg}${ctxStr}`)
    } else {
      console.log(`${ts} ${prefix} ${msg}${ctxStr}`)
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
  info:  (msg: string, ctx?: LogContext) => emit('info',  msg, ctx),
  warn:  (msg: string, ctx?: LogContext) => emit('warn',  msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),
} as const

/** Shorthand for job-scoped logging — prefixes all messages with the job name */
export function jobLogger(jobName: string) {
  const prefix = (msg: string) => `[${jobName}] ${msg}`
  return {
    debug: (msg: string, ctx?: LogContext) => emit('debug', prefix(msg), { job: jobName, ...ctx }),
    info:  (msg: string, ctx?: LogContext) => emit('info',  prefix(msg), { job: jobName, ...ctx }),
    warn:  (msg: string, ctx?: LogContext) => emit('warn',  prefix(msg), { job: jobName, ...ctx }),
    error: (msg: string, ctx?: LogContext) => emit('error', prefix(msg), { job: jobName, ...ctx }),
  }
}
