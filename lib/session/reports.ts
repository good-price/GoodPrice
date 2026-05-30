/**
 * lib/session/reports.ts
 *
 * SERVER-ONLY module — uses Node.js fs APIs.
 * Import only from server components or API route handlers.
 * Never import from client components or client-compatible modules.
 *
 * Manages the anonymous aggregate signal file that powers admin analytics.
 *
 * File format: data/session/aggregate-signals.json
 *   { updatedAt: string, signals: SessionSignal[] }
 *
 * Signals are anonymous (no session IDs, no PII, no IP) — each signal
 * contains only: topCategories[], isReturn, hasWatchlist, ts (number).
 *
 * Rolling retention: at most MAX_SIGNALS_STORED entries are kept.
 * computeSessionAnalytics() analyses only signals within ANALYTICS_WINDOW_DAYS.
 *
 * Public API:
 *   appendSessionSignal(signal)           → void  (write path — called by API route)
 *   computeSessionAnalytics(windowDays?)  → SessionAnalytics  (read path — called by admin page)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { SessionSignal, SessionSignalFile, SessionAnalytics, CategoryInterestStat } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SIGNALS_STORED   = 1000
const ANALYTICS_WINDOW_DAYS = 7

// ── File path ─────────────────────────────────────────────────────────────────

function getSignalFilePath(): string {
  return join(process.cwd(), 'data', 'session', 'aggregate-signals.json')
}

// ── Disk I/O ──────────────────────────────────────────────────────────────────

function loadSignalFile(): SessionSignalFile | null {
  const path = getSignalFilePath()
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as SessionSignalFile
    if (!Array.isArray(raw.signals)) return null
    return raw
  } catch {
    return null
  }
}

function saveSignalFile(file: SessionSignalFile): void {
  const path = getSignalFilePath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(file, null, 2), 'utf8')
  } catch (err) {
    console.error('[session/reports] Failed to write signal file:', err)
  }
}

// ── Write path ────────────────────────────────────────────────────────────────

/**
 * Appends an anonymous session signal to the rolling aggregate file.
 * Called by POST /api/session/events — never during render.
 *
 * Keeps at most MAX_SIGNALS_STORED entries (oldest are dropped).
 * Concurrent writes are not atomic — acceptable for lightweight analytics.
 */
export function appendSessionSignal(signal: SessionSignal): void {
  const existing = loadSignalFile()
  const signals  = existing?.signals ?? []

  // Prepend new signal and cap at max
  const updated = [signal, ...signals].slice(0, MAX_SIGNALS_STORED)

  saveSignalFile({
    updatedAt: new Date().toISOString(),
    signals:   updated,
  })
}

// ── Read path (admin analytics) ───────────────────────────────────────────────

/**
 * Reads the signal file and computes aggregate session analytics
 * for the admin dashboard.
 *
 * Only signals within the last `windowDays` are included in the analysis.
 * Returns a zero-state SessionAnalytics when no data is available.
 */
export function computeSessionAnalytics(windowDays = ANALYTICS_WINDOW_DAYS): SessionAnalytics {
  const empty: SessionAnalytics = {
    windowDays,
    totalSessions:         0,
    returnRate:            0,
    watchlistAdoptionRate: 0,
    topCategories:         [],
    lastSignalAt:          null,
    hasData:               false,
  }

  const file = loadSignalFile()
  if (!file || file.signals.length === 0) return empty

  // Filter to analysis window
  const cutoff  = Date.now() - windowDays * 24 * 60 * 60 * 1000
  const window  = file.signals.filter(s => s.ts >= cutoff)

  if (window.length === 0) return empty

  const total        = window.length
  const returnCount  = window.filter(s => s.isReturn).length
  const watchCount   = window.filter(s => s.hasWatchlist).length
  const lastSignal   = window.reduce((latest, s) => s.ts > latest ? s.ts : latest, 0)

  // Category interest: count how many signals mention each category
  const catCount: Record<string, number> = {}
  for (const signal of window) {
    for (const cat of signal.topCategories) {
      catCount[cat] = (catCount[cat] ?? 0) + 1
    }
  }

  const topCategories: CategoryInterestStat[] = Object.entries(catCount)
    .map(([category, count]) => ({
      category,
      count,
      pct: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    windowDays,
    totalSessions:         total,
    returnRate:            Math.round((returnCount / total) * 100) / 100,
    watchlistAdoptionRate: Math.round((watchCount  / total) * 100) / 100,
    topCategories,
    lastSignalAt:          new Date(lastSignal).toISOString(),
    hasData:               true,
  }
}
