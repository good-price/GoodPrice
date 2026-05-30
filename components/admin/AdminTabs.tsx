/**
 * components/admin/AdminTabs.tsx
 *
 * Client-side tab switcher for admin module pages.
 * Works with server component children — all panels are SSR-rendered
 * and toggled with CSS display:none / block client-side.
 * No hydration mismatch. No data re-fetching per tab switch.
 *
 * 'use client' — tab state only.
 */

'use client'

import { useState, Children } from 'react'
import type { ReactNode }     from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TabDef {
  id:      string
  label:   string
  /** Optional badge count (e.g. number of issues) */
  count?:  number
  /** Optional warning — turns badge red */
  warn?:   boolean
}

interface Props {
  tabs:        TabDef[]
  children:    ReactNode
  defaultTab?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminTabs({ tabs, children, defaultTab }: Props) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id ?? '')

  // Safely convert children to array — handles fragments, nulls, and single elements.
  const panels = Children.toArray(children)

  return (
    <div>
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {tabs.map(tab => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              className={[
                'relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium',
                'border-b-2 -mb-px transition-colors whitespace-nowrap',
                isActive
                  ? 'border-[#F7A823] text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
              ].join(' ')}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={[
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none',
                  tab.warn
                    ? 'bg-red-100 text-red-600'
                    : isActive
                      ? 'bg-gray-100 text-gray-600'
                      : 'bg-gray-100 text-gray-400',
                ].join(' ')}>
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Tab panels ──────────────────────────────────────────────────── */}
      {panels.map((panel, i) => {
        const tabId = tabs[i]?.id
        return (
          <div
            key={tabId ?? i}
            className={active === tabId ? 'block' : 'hidden'}
          >
            {panel}
          </div>
        )
      })}
    </div>
  )
}
