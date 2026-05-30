/**
 * components/ops/FloatingActionDock.tsx
 *
 * Fixed bottom-left quick-action dock for the GOODPRICE OPS workspace.
 * Shows compact icon buttons for the 4 most common pipeline triggers.
 * Each button fires a POST to the relevant API endpoint.
 *
 * No props required — self-contained, uses COMMAND_DEFS api_call entries.
 * 'use client' — state + fetch.
 */

'use client'

import { useState, useCallback } from 'react'

// ── Quick actions ─────────────────────────────────────────────────────────────

interface QuickAction {
  id:    string
  icon:  string
  label: string
  url:   string
  color: string
}

const DOCK_ACTIONS: QuickAction[] = [
  {
    id:    'recovery',
    icon:  '⟳',
    label: 'Recovery',
    url:   '/api/ops/run',
    color: 'hover:text-blue-400 hover:border-blue-700',
  },
  {
    id:    'trust',
    icon:  '◎',
    label: 'Trust',
    url:   '/api/catalog/trust/recompute',
    color: 'hover:text-purple-400 hover:border-purple-700',
  },
  {
    id:    'healing',
    icon:  '⟲',
    label: 'Healing',
    url:   '/api/catalog/self-healing/run',
    color: 'hover:text-green-400 hover:border-green-700',
  },
  {
    id:    'repair',
    icon:  '⚙',
    label: 'Repair',
    url:   '/api/catalog/repair/run',
    color: 'hover:text-orange-400 hover:border-orange-700',
  },
]

// ── Status type ───────────────────────────────────────────────────────────────

type ActionStatus = 'idle' | 'running' | 'ok' | 'error'

// ── Dock button ───────────────────────────────────────────────────────────────

function DockButton({
  action,
  status,
  onRun,
}: {
  action:  QuickAction
  status:  ActionStatus
  onRun:   (id: string) => void
}) {
  const iconCls =
    status === 'running' ? 'animate-spin text-purple-400' :
    status === 'ok'      ? 'text-green-400' :
    status === 'error'   ? 'text-red-400' :
    'text-gray-600'

  const borderCls =
    status === 'running' ? 'border-purple-700 bg-purple-900/20' :
    status === 'ok'      ? 'border-green-700 bg-green-900/20' :
    status === 'error'   ? 'border-red-800 bg-red-900/20' :
    `border-gray-800 bg-gray-900/80 ${action.color}`

  return (
    <button
      onClick={() => onRun(action.id)}
      disabled={status === 'running'}
      title={action.label}
      className={[
        'group relative w-8 h-8 flex items-center justify-center rounded-lg border',
        'text-sm transition-all duration-150 backdrop-blur-sm',
        borderCls,
      ].join(' ')}
    >
      <span className={iconCls}>{action.icon}</span>

      {/* Tooltip */}
      <span className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-lg bg-gray-900 border border-gray-700 text-[10px] text-gray-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
        {status === 'running' ? `${action.label}…` :
         status === 'ok'      ? `${action.label} ✓` :
         status === 'error'   ? `${action.label} ✕` :
         action.label}
      </span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function FloatingActionDock() {
  const [statuses, setStatuses] = useState<Record<string, ActionStatus>>({})

  const handleRun = useCallback(async (id: string) => {
    const action = DOCK_ACTIONS.find(a => a.id === id)
    if (!action) return

    setStatuses(s => ({ ...s, [id]: 'running' }))

    try {
      const res  = await fetch(action.url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ operator: 'admin' }),
      })
      const data = await res.json() as { ok: boolean }
      setStatuses(s => ({ ...s, [id]: data.ok ? 'ok' : 'error' }))
    } catch {
      setStatuses(s => ({ ...s, [id]: 'error' }))
    }

    // Reset to idle after 3s
    setTimeout(() => {
      setStatuses(s => ({ ...s, [id]: 'idle' }))
    }, 3_000)
  }, [])

  return (
    <div className="fixed bottom-4 left-4 z-40 flex flex-col gap-1.5">
      {DOCK_ACTIONS.map(action => (
        <DockButton
          key={action.id}
          action={action}
          status={statuses[action.id] ?? 'idle'}
          onRun={handleRun}
        />
      ))}
    </div>
  )
}
