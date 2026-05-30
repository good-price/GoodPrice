/**
 * components/ops/OpsSidebar.tsx
 *
 * Left sidebar navigation for the GOODPRICE OPS workspace.
 * Shows section groups, active state, count badges, and a collapse toggle.
 * 'use client' — drives interactive navigation.
 */

'use client'

import type { SectionDef, OpsSnapshot, WorkspaceSection } from '@/lib/ops/workspace/types'
import { SIDEBAR_GROUPS, GROUP_LABELS, getSectionsByGroup } from '@/lib/ops/workspace/navigation'
import { buildSectionCounts } from '@/lib/ops/workspace/section-counts'

// ── Count badge ────────────────────────────────────────────────────────────────

function Badge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span className="ml-auto flex-shrink-0 text-[9px] font-bold bg-blue-600 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center tabular-nums">
      {count > 99 ? '99+' : count}
    </span>
  )
}

// ── Section item ──────────────────────────────────────────────────────────────

function SectionItem({
  def,
  active,
  collapsed,
  count,
  onClick,
}: {
  def:      SectionDef
  active:   boolean
  collapsed: boolean
  count:    number
  onClick:  () => void
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? def.label : undefined}
      className={[
        'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-all duration-150 group',
        active
          ? 'bg-gray-700 text-white'
          : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800',
      ].join(' ')}
    >
      <span className={[
        'text-base flex-shrink-0 w-5 text-center transition-colors',
        active ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-300',
      ].join(' ')}>
        {def.icon}
      </span>

      {!collapsed && (
        <>
          <span className="text-[12px] font-medium truncate flex-1">
            {def.label}
          </span>
          <Badge count={count} />
        </>
      )}

      {collapsed && count > 0 && (
        <span className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full bg-blue-500" />
      )}
    </button>
  )
}

// ── Group label ────────────────────────────────────────────────────────────────

function GroupLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (!label || collapsed) return null
  return (
    <p className="px-2.5 pt-3 pb-1 text-[9px] font-bold text-gray-600 uppercase tracking-widest">
      {label}
    </p>
  )
}

// ── Sidebar component ─────────────────────────────────────────────────────────

interface Props {
  sections:      SectionDef[]
  activeSection: WorkspaceSection
  collapsed:     boolean
  snapshot:      OpsSnapshot
  onNavigate:    (s: WorkspaceSection) => void
  onToggle:      () => void
}

export function OpsSidebar({
  sections,
  activeSection,
  collapsed,
  snapshot,
  onNavigate,
  onToggle,
}: Props) {
  const counts = buildSectionCounts(snapshot)

  const getSectionCount = (id: WorkspaceSection): number => {
    const map: Partial<Record<WorkspaceSection, number>> = {
      catalog:    counts.catalog,
      visibility: counts.visibility,
      recovery:   counts.recovery,
      repair:     counts.repair,
      operations: counts.operations,
      logs:       counts.logs,
    }
    return map[id] ?? 0
  }

  return (
    <aside
      className={[
        'flex-shrink-0 flex flex-col bg-gray-900 border-r border-gray-800 transition-all duration-200',
        collapsed ? 'w-[52px]' : 'w-[224px]',
      ].join(' ')}
    >
      {/* Logo / brand */}
      <div className={[
        'flex items-center border-b border-gray-800 flex-shrink-0',
        collapsed ? 'justify-center h-12 px-2' : 'h-12 px-4',
      ].join(' ')}>
        {collapsed ? (
          <span className="text-[#F7A823] font-black text-sm">G</span>
        ) : (
          <span className="text-xs font-bold text-gray-100">
            <span className="text-[#F7A823]">GOOD</span>PRICE
            <span className="ml-1.5 text-[9px] font-medium text-gray-500 uppercase tracking-wider">OPS</span>
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 space-y-0.5 scrollbar-thin">
        {SIDEBAR_GROUPS.map(group => {
          const groupSections = getSectionsByGroup(group).filter(s =>
            sections.some(def => def.id === s.id),
          )
          if (groupSections.length === 0) return null

          return (
            <div key={group}>
              <GroupLabel label={GROUP_LABELS[group]} collapsed={collapsed} />
              {groupSections.map(def => (
                <div key={def.id} className="relative">
                  <SectionItem
                    def={def}
                    active={activeSection === def.id}
                    collapsed={collapsed}
                    count={getSectionCount(def.id)}
                    onClick={() => onNavigate(def.id)}
                  />
                </div>
              ))}
            </div>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="flex-shrink-0 border-t border-gray-800 p-2">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center h-8 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          <span className="text-sm">{collapsed ? '›' : '‹'}</span>
        </button>
      </div>
    </aside>
  )
}
