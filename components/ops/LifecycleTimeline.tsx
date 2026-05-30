/**
 * components/ops/LifecycleTimeline.tsx
 *
 * Per-product lifecycle event timeline.
 * Shows chronological events: actions, validations, quarantine, overrides.
 * Server component — no client JS.
 */

import type { ProductHistoryEntry } from '@/lib/ops/actions/types'

interface Props {
  productId: string
  events:    ProductHistoryEntry[]
}

function EventDot({ automated }: { automated: boolean }) {
  return (
    <span className={[
      'w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
      automated ? 'bg-blue-400' : 'bg-orange-400',
    ].join(' ')} />
  )
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('es-CO', {
      day:    '2-digit',
      month:  '2-digit',
      hour:   '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

export function LifecycleTimeline({ events }: Props) {
  if (events.length === 0) {
    return (
      <p className="text-xs text-gray-400 py-3 text-center">
        Sin eventos registrados para este producto.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Manual</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Automatizado</span>
      </div>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[3px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />

        <div className="space-y-3 pl-5">
          {events.map((ev, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-5 top-1.5">
                <EventDot automated={ev.automated} />
              </div>

              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-100 leading-tight">
                      {ev.event}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug line-clamp-3">
                      {ev.detail}
                    </p>
                    {ev.operator && (
                      <p className="text-[9px] text-gray-400 mt-0.5">
                        por <span className="font-medium">{ev.operator}</span>
                      </p>
                    )}
                  </div>
                  <span className="text-[9px] text-gray-400 flex-shrink-0 font-mono">
                    {fmtTime(ev.timestamp)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
