'use client'

/**
 * useTrack — fire-and-forget analytics hook.
 *
 * Rules:
 *  - NEVER awaited — tracking must not delay any user action
 *  - Uses fetch({ keepalive: true }) so the request survives same-tab navigation
 *  - Errors are swallowed silently — a failed track is always preferable to a broken UX
 *  - Path is captured automatically from window.location
 */

import { useCallback } from 'react'
import type { TrackEvent, TrackEventType } from '@/types'

type TrackPayload = Omit<TrackEvent, 'ts' | 'path'>

export function useTrack() {
  const track = useCallback((payload: TrackPayload) => {
    const event: TrackEvent = {
      ...payload,
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      ts: Date.now(),
    }

    // keepalive: true → request completes even when the page navigates away
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => {
      // Silently ignore — tracking must never surface errors to the user
    })
  }, [])

  return { track }
}

// ── Convenience typed wrappers ────────────────────────────────────────────────

export function useProductTrack() {
  const { track } = useTrack()

  return useCallback(
    (productId: string, asin: string | undefined, category: string) => {
      track({
        event: 'product_click' as TrackEventType,
        productId,
        asin,
        category,
      })
    },
    [track]
  )
}

export function useCategoryTrack() {
  const { track } = useTrack()

  return useCallback(
    (category: string) => {
      track({ event: 'category_view' as TrackEventType, category })
    },
    [track]
  )
}
