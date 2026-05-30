/**
 * components/ops/OpsTopbar.tsx
 *
 * Top navigation bar for the GOODPRICE OPS workspace.
 * Shows: hamburger toggle, breadcrumb, system status, quick actions.
 * 'use client' — interactive controls.
 */

'use client'

import type { SectionDef, OpsSnapshot, WorkspaceSection } from '@/lib/ops/workspace/types'

// ── Status indicator ──────────────────────────────────────────────────────────

function StatusDot({ status }: { status: OpsSnapshot['systemStatus'] }) {
  const color =
    status === 'ok'       ? 'bg-green-500' :
    status === 'degraded' ? 'bg-yellow-400' :
                            'bg-red-500'
  const pulse = status !== 'ok'
  return (
    <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`}>
      {pulse && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`} />
      )}
    </span>
  )
}

// ── Health score pill ─────────────────────────────────────────────────────────

function HealthPill({ score }: { score: number }) {
  const color =
    score >= 75 ? 'text-green-400 bg-green-400/10' :
    score >= 50 ? 'text-yellow-400 bg-yellow-400/10' :
                  'text-red-400 bg-red-400/10'
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${color}`}>
      {score}/100
    </span>
  )
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

function Breadcrumb({ section, sections }: { section: WorkspaceSection; sections: SectionDef[] }) {
  const def = sections.find(s => s.id === section)
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-gray-500">OPS</span>
      <span className="text-gray-700">/</span>
      <span className="text-gray-200 font-medium">{def?.label ?? section}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  activeSection:   WorkspaceSection
  sections:        SectionDef[]
  collapsed:       boolean
  snapshot:        OpsSnapshot
  onToggleSidebar: () => void
  onOpenPalette:   () => void
}

export function OpsTopbar({
  activeSection,
  sections,
  snapshot,
  onToggleSidebar,
  onOpenPalette,
}: Props) {
  const relTime = (iso: string): string => {
    const ms = Date.now() - new Date(iso).getTime()
    if (ms < 60_000) return 'ahora'
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`
    return `${Math.floor(ms / 3_600_000)}h`
  }

  return (
    <header className="h-12 flex-shrink-0 flex items-center gap-2 px-3 bg-gray-900 border-b border-gray-800">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors flex-shrink-0"
        title="Toggle sidebar"
      >
        <span className="text-sm">☰</span>
      </button>

      {/* Breadcrumb */}
      <div className="flex-1 min-w-0 px-1">
        <Breadcrumb section={activeSection} sections={sections} />
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* System status */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-800">
          <StatusDot status={snapshot.systemStatus} />
          <HealthPill score={snapshot.healthScore} />
        </div>

        {/* Active jobs indicator */}
        {snapshot.activeJobCount > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-purple-900/50 border border-purple-800">
            <span className="animate-spin text-[10px]">⟳</span>
            <span className="text-[10px] text-purple-300 font-medium">
              {snapshot.activeJobCount} job{snapshot.activeJobCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Last updated */}
        <span className="text-[10px] text-gray-600 hidden sm:block">
          {relTime(snapshot.timestamp)}
        </span>

        {/* Command palette trigger */}
        <button
          onClick={onOpenPalette}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 transition-all text-xs text-gray-400 hover:text-gray-200"
          title="Command palette (Ctrl+K)"
        >
          <span>⌘</span>
          <span>K</span>
        </button>
      </div>
    </header>
  )
}
