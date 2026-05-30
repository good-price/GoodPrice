/**
 * useWatchlist — client-side watchlist hook
 *
 * Manages the user's product watchlist in localStorage.
 * Handles SSR gracefully (returns empty list during server render).
 *
 * Storage:
 *   localStorage['gp_watchlist'] → JSON array of LocalWatchlistItem
 *   localStorage['gp_uid']       → anonymous UUID (stable across sessions)
 *
 * Usage:
 *   const { items, isWatched, add, remove, updateAlert } = useWatchlist()
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import type { LocalWatchlistItem, AlertTrigger } from '@/lib/watchlist/types'
import { trackSessionEvent } from '@/lib/session'

const STORAGE_KEY = 'gp_watchlist'
const UID_KEY     = 'gp_uid'

// ── Anonymous ID ──────────────────────────────────────────────────────────────

/** Get or create the anonymous user ID (UUID stored in localStorage). */
export function getAnonId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(UID_KEY)
  if (!id) {
    // Simple UUID v4 generation without crypto dependency
    const chars = '0123456789abcdef'
    let uuid = 'uid-'
    for (let i = 0; i < 28; i++) {
      uuid += chars[Math.floor(Math.random() * 16)]
      if (i === 7 || i === 11 || i === 15) uuid += '-'
    }
    id = uuid
    localStorage.setItem(UID_KEY, id)
  }
  return id
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function readFromStorage(): LocalWatchlistItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as LocalWatchlistItem[]
  } catch {
    return []
  }
}

function writeToStorage(items: LocalWatchlistItem[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface WatchlistActions {
  /** All tracked items (empty during SSR) */
  items: LocalWatchlistItem[]
  /** Whether a product is currently in the watchlist */
  isWatched: (productId: string) => boolean
  /** Add a product to the watchlist */
  add: (item: Omit<LocalWatchlistItem, 'addedAt'>) => void
  /** Remove a product from the watchlist */
  remove: (productId: string) => void
  /** Update alert settings for a tracked product */
  updateAlert: (
    productId: string,
    alert: {
      trigger:     AlertTrigger
      targetUSD?:  number
      subscriptionId?: string
    },
  ) => void
  /** Whether the watchlist has loaded from localStorage */
  loaded: boolean
}

export function useWatchlist(): WatchlistActions {
  const [items, setItems] = useState<LocalWatchlistItem[]>([])
  const [loaded, setLoaded] = useState(false)

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setItems(readFromStorage())
    setLoaded(true)
  }, [])

  const isWatched = useCallback(
    (productId: string) => items.some(i => i.productId === productId),
    [items],
  )

  const add = useCallback((item: Omit<LocalWatchlistItem, 'addedAt'>) => {
    setItems(prev => {
      if (prev.some(i => i.productId === item.productId)) return prev
      const next = [
        ...prev,
        { ...item, addedAt: new Date().toISOString() },
      ]
      writeToStorage(next)
      return next
    })
    // Sync watchlist state to session profile for personalization
    trackSessionEvent({ type: 'watchlist_add', productId: item.productId, ts: Date.now() })
  }, [])

  const remove = useCallback((productId: string) => {
    setItems(prev => {
      const next = prev.filter(i => i.productId !== productId)
      writeToStorage(next)
      return next
    })
    // Sync watchlist removal to session profile
    trackSessionEvent({ type: 'watchlist_remove', productId, ts: Date.now() })
  }, [])

  const updateAlert = useCallback(
    (productId: string, alert: { trigger: AlertTrigger; targetUSD?: number; subscriptionId?: string }) => {
      setItems(prev => {
        const next = prev.map(item =>
          item.productId === productId
            ? {
                ...item,
                alertTrigger:        alert.trigger,
                alertTargetUSD:      alert.targetUSD,
                alertSubscriptionId: alert.subscriptionId,
              }
            : item,
        )
        writeToStorage(next)
        return next
      })
    },
    [],
  )

  return { items, isWatched, add, remove, updateAlert, loaded }
}
