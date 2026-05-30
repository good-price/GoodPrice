/**
 * components/ops/CommandPalette.tsx
 *
 * Ctrl+K command palette overlay for the GOODPRICE OPS workspace.
 * Supports navigation, API calls, keyboard navigation.
 * 'use client' — purely interactive overlay.
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { WorkspaceSection } from '@/lib/ops/workspace/types'
import { searchCommands, groupCommands } from '@/lib/ops/workspace/command-palette'
import type { CommandDef } from '@/lib/ops/workspace/types'

interface Props {
  onClose:    () => void
  onNavigate: (section: WorkspaceSection) => void
}

// ── Action execution ──────────────────────────────────────────────────────────

async function executeApiCall(url: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ operator: 'admin' }),
    })
    const data = await res.json() as { ok: boolean; error?: string; result?: { summary?: string } }
    return {
      ok:      data.ok,
      message: data.ok
        ? (data.result?.summary ?? 'Ejecutado correctamente.')
        : (data.error ?? 'Error desconocido'),
    }
  } catch {
    return { ok: false, message: 'Error de red' }
  }
}

// ── Command item ──────────────────────────────────────────────────────────────

function CommandItem({
  cmd,
  selected,
  onSelect,
  executing,
  feedback,
}: {
  cmd:       CommandDef
  selected:  boolean
  onSelect:  () => void
  executing: boolean
  feedback?: { ok: boolean; message: string }
}) {
  return (
    <button
      onClick={onSelect}
      disabled={executing}
      className={[
        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
        selected ? 'bg-blue-600/20 border-l-2 border-blue-500' : 'border-l-2 border-transparent hover:bg-gray-800',
      ].join(' ')}
    >
      <span className="text-base w-6 text-center flex-shrink-0 text-gray-400">{cmd.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-100 font-medium truncate">{cmd.label}</p>
        {feedback ? (
          <p className={`text-[11px] ${feedback.ok ? 'text-green-400' : 'text-red-400'}`}>
            {feedback.ok ? '✓' : '⚠'} {feedback.message}
          </p>
        ) : (
          cmd.description && (
            <p className="text-[11px] text-gray-500 truncate">{cmd.description}</p>
          )
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {cmd.shortcut && (
          <kbd className="text-[10px] bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-500 font-mono">
            {cmd.shortcut}
          </kbd>
        )}
        {executing && <span className="text-[11px] text-purple-400 animate-pulse">…</span>}
        {selected && !executing && (
          <span className="text-[10px] text-gray-600">↵</span>
        )}
      </div>
    </button>
  )
}

// ── Main palette ──────────────────────────────────────────────────────────────

export function CommandPalette({ onClose, onNavigate }: Props) {
  const [query,     setQuery]     = useState('')
  const [selIndex,  setSelIndex]  = useState(0)
  const [executing, setExecuting] = useState<string | null>(null)
  const [feedbacks, setFeedbacks] = useState<Record<string, { ok: boolean; message: string }>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  const results = searchCommands(query)
  const groups  = groupCommands(results)
  const flat    = results  // flat list for keyboard nav

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Reset selection when query changes
  useEffect(() => { setSelIndex(0) }, [query])

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelIndex(i => Math.min(i + 1, flat.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (flat[selIndex]) handleSelect(flat[selIndex])
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, selIndex])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selIndex])

  const handleSelect = useCallback(async (cmd: CommandDef) => {
    if (executing) return

    if (cmd.actionType === 'navigate') {
      onNavigate(cmd.actionValue as WorkspaceSection)
      onClose()
      return
    }

    if (cmd.actionType === 'api_call') {
      setExecuting(cmd.id)
      const result = await executeApiCall(cmd.actionValue)
      setFeedbacks(f => ({ ...f, [cmd.id]: result }))
      setExecuting(null)
      if (result.ok) {
        setTimeout(() => {
          setFeedbacks(f => { const n = { ...f }; delete n[cmd.id]; return n })
          onClose()
        }, 2000)
      }
      return
    }

    if (cmd.actionType === 'external') {
      window.open(cmd.actionValue, '_blank', 'noopener,noreferrer')
      onClose()
    }
  }, [executing, onNavigate, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-x-0 top-[15vh] z-[10001] mx-auto max-w-xl px-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
            <span className="text-gray-500 text-sm">⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar comandos, secciones, acciones…"
              className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-600 focus:outline-none"
            />
            <kbd className="text-[10px] bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-500">
              Esc
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto">
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-gray-500">Sin resultados para &ldquo;{query}&rdquo;</p>
              </div>
            ) : (
              groups.map(({ group, commands }) => (
                <div key={group}>
                  <p className="px-4 pt-3 pb-1 text-[9px] font-bold text-gray-600 uppercase tracking-widest">
                    {group}
                  </p>
                  {commands.map(cmd => {
                    const idx = flat.findIndex(c => c.id === cmd.id)
                    return (
                      <div key={cmd.id} data-selected={idx === selIndex ? 'true' : undefined}>
                        <CommandItem
                          cmd={cmd}
                          selected={idx === selIndex}
                          onSelect={() => handleSelect(cmd)}
                          executing={executing === cmd.id}
                          feedback={feedbacks[cmd.id]}
                        />
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-4 text-[10px] text-gray-600">
            <span>↑↓ navegar</span>
            <span>↵ ejecutar</span>
            <span>Esc cerrar</span>
          </div>
        </div>
      </div>
    </>
  )
}
