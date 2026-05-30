/**
 * components/ops/LiveExecutionFeed.tsx
 *
 * Polling-based live operational event feed.
 * Appears as a compact pill in the bottom-right corner.
 * Expands to show recent events on click.
 * Polls /api/ops/live every 5 seconds.
 *
 * 'use client' — polling + state.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import type { LiveEvent, OpsSnapshot }      from '@/lib/ops/workspace/types'

interface Props {
  initialEvents: LiveEvent[]
}

// ── Event level styles ────────────────────────────────────────────────────────

const LEVEL_DOT: Record<string, string> = {
  info:    'bg-blue-400',
  success: 'bg-green-400',
  warning: 'bg-yellow-400',
  error:   'bg-red-500',
}

const LEVEL_TEXT: Record<string, string> = {
  info:    'text-blue-300',
  success: 'text-green-300',
  warning: 'text-yellow-300',
  error:   'text-red-300',
}

const LEVEL_ICON: Record<string, string> = {
  info:    'ℹ',
  success: '✓',
  warning: '⚠',
  error:   '✕',
}

// ── Relative time ──────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.floor(ms / 1_000)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`
  return `${Math.floor(ms / 3_600_000)}h`
}

// ── Event item ────────────────────────────────────────────────────────────────

function EventItem({ event }: { event: LiveEvent }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 border-b border-gray-800/60 last:border-0">
      <span className={`text-xs flex-shrink-0 mt-0.5 ${LEVEL_TEXT[event.level] ?? 'text-gray-400'}`}>
        {LEVEL_ICON[event.level] ?? '·'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-200 font-medium leading-tight truncate">
          {event.title}
        </p>
        <p className="text-[10px] text-gray-500 leading-tight truncate mt-0.5">
          {event.detail}
        </p>
      </div>
      <span className="text-[9px] text-gray-600 flex-shrink-0 font-mono">
        {relTime(event.timestamp)}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const POLL_INTERVAL = 5_000   // 5 seconds
const MAX_DISPLAY   = 10

export function LiveExecutionFeed({ initialEvents }: Props) {
  const [events,   setEvents]   = useState<LiveEvent[]>(initialEvents.slice(0, MAX_DISPLAY))
  const [open,     setOpen]     = useState(false)
  const [hasNew,   setHasNew]   = useState(false)
  const [newCount, setNewCount] = useState(0)

  const fetchLatest = useCallback(async () => {
    try {
      const res  = await fetch('/api/ops/live', { cache: 'no-store' })
      const data = await res.json() as { ok: boolean; snapshot: OpsSnapshot }
      if (!data.ok || !data.snapshot) return

      const incoming = data.snapshot.recentEvents.slice(0, MAX_DISPLAY)
      setEvents(prev => {
        const prevIds = new Set(prev.map(e => e.id))
        const newOnes = incoming.filter(e => !prevIds.has(e.id))
        if (newOnes.length > 0) {
          setHasNew(true)
          setNewCount(n => n + newOnes.length)
        }
        return incoming
      })
    } catch { /* network error — fail silently */ }
  }, [])

  // Poll every 5s
  useEffect(() => {
    const id = setInterval(fetchLatest, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchLatest])

  function handleOpen() {
    setOpen(v => !v)
    setHasNew(false)
    setNewCount(0)
  }

  // Latest event level for pill color
  const latestLevel = events[0]?.level ?? 'info'

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-1">
      {/* Expanded feed */}
      {open && (
        <div className="w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Live Events
            </p>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-600 hover:text-gray-400 text-xs transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-6">Sin eventos recientes.</p>
            ) : (
              events.map(ev => <EventItem key={ev.id} event={ev} />)
            )}
          </div>
          <div className="px-3 py-1.5 border-t border-gray-800">
            <p className="text-[9px] text-gray-600">Actualiza cada {POLL_INTERVAL / 1000}s</p>
          </div>
        </div>
      )}

      {/* Feed pill */}
      <button
        onClick={handleOpen}
        className={[
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[11px] font-medium transition-all shadow-lg',
          open
            ? 'bg-gray-800 border-gray-700 text-gray-200'
            : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200',
        ].join(' ')}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${LEVEL_DOT[latestLevel] ?? 'bg-gray-500'}`} />
        <span>Feed</span>
        {hasNew && newCount > 0 && (
          <span className="bg-blue-600 text-white text-[9px] font-bold rounded-full px-1.5 min-w-[16px] text-center">
            {newCount > 9 ? '9+' : newCount}
          </span>
        )}
      </button>
    </div>
  )
}
