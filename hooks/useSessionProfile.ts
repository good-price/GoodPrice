'use client'

/**
 * hooks/useSessionProfile.ts
 *
 * React hook for reactive access to the GOODPRICE anonymous session profile.
 *
 * Provides:
 *   profile         — current SessionProfile (null before hydration)
 *   trackEvent()    — fire a session event and update state + localStorage
 *   topCategories   — top N category slugs by affinity score
 *   isHighIntent    — user has clicked Amazon CTAs 3+ times
 *   isReturnVisitor — user has visited more than once
 *   hasSignal       — profile has enough data to personalise content
 *
 * On mount:
 *   1. Loads (or creates) the session profile from localStorage
 *   2. Increments visitCount via touchVisit()
 *   3. Sends a fire-and-forget anonymous signal to /api/session/events
 *      for server-side aggregate analytics
 *
 * Privacy guarantee:
 *   - Session ID never leaves the device
 *   - Only anonymous aggregate signals (topCategories[], isReturn, hasWatchlist)
 *     are sent to the server
 *   - No fingerprinting, no PII, no third-party services
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { SessionProfile, SessionEvent } from '@/lib/session/types'
import {
  getOrCreateProfile,
  touchVisit,
  applyEvent,
  saveProfile,
  getTopCategories,
  isHighIntent     as computeHighIntent,
  isReturnVisitor  as computeReturnVisitor,
  hasPersonalizationSignal,
} from '@/lib/session'

// ── Anonymous analytics ping ───────────────────────────────────────────────────

/**
 * Posts anonymous aggregate signals to the server for admin analytics.
 * Fire-and-forget — errors are swallowed completely.
 * keepalive: true ensures the request survives same-tab navigation.
 */
function pingSessionSignals(profile: SessionProfile): void {
  try {
    const body = {
      topCategories: getTopCategories(profile, 3),
      isReturn:      profile.visitCount > 1,
      hasWatchlist:  profile.watchlistProducts.length > 0,
    }
    fetch('/api/session/events', {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body:      JSON.stringify(body),
      keepalive: true,
    }).catch(() => { /* silently ignore */ })
  } catch {
    // Never throw from analytics
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseSessionProfileResult {
  /** Current session profile — null before client hydration */
  profile:         SessionProfile | null
  /** Fire a session event (updates state + localStorage) */
  trackEvent:      (event: SessionEvent) => void
  /** Top N category slugs by affinity (stable across renders) */
  topCategories:   string[]
  /** User has clicked through to Amazon 3+ times */
  isHighIntent:    boolean
  /** User has visited more than once */
  isReturnVisitor: boolean
  /** Profile has enough signal to personalise content */
  hasSignal:       boolean
}

export function useSessionProfile(): UseSessionProfileResult {
  const [profile, setProfile] = useState<SessionProfile | null>(null)

  useEffect(() => {
    // Load/create profile and increment visit count (runs once on mount)
    const raw     = getOrCreateProfile()
    const touched = touchVisit(raw)
    setProfile(touched)

    // Fire-and-forget analytics ping (no await — non-blocking)
    pingSessionSignals(touched)
  }, [])

  const trackEvent = useCallback((event: SessionEvent) => {
    setProfile(prev => {
      if (!prev) return prev
      const updated = applyEvent(prev, event)
      saveProfile(updated)
      return updated
    })
  }, [])

  const topCategories = useMemo(
    () => (profile ? getTopCategories(profile, 5) : []),
    [profile],
  )

  const highIntent    = profile ? computeHighIntent(profile)    : false
  const returnVisitor = profile ? computeReturnVisitor(profile) : false
  const hasSignal     = profile ? hasPersonalizationSignal(profile) : false

  return {
    profile,
    trackEvent,
    topCategories,
    isHighIntent:    highIntent,
    isReturnVisitor: returnVisitor,
    hasSignal,
  }
}
