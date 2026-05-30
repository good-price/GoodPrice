'use client'

/**
 * TrackPageView — invisible client component that fires a single tracking event on mount.
 *
 * Usage: Drop inside any Server Component page to get client-side analytics.
 * Renders nothing — zero visual impact.
 *
 * Example:
 *   <TrackPageView event="category_view" category={params.slug} />
 */

import { useEffect } from 'react'
import { useTrack } from '@/hooks/useTrack'
import type { TrackEventType } from '@/types'

interface TrackPageViewProps {
  event: TrackEventType
  category?: string
}

export function TrackPageView({ event, category }: TrackPageViewProps) {
  const { track } = useTrack()

  useEffect(() => {
    track({ event, category })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Fire once on mount only — deps intentionally omitted

  return null
}
