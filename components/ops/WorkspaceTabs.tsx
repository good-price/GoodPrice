/**
 * components/ops/WorkspaceTabs.tsx
 *
 * Tab bar for the GOODPRICE OPS workspace.
 * Pinned tabs persist across sessions; regular tabs are closeable.
 * 'use client' — interactive tab switching.
 */

'use client'

import type { SectionDef, WorkspaceSection, WorkspaceTab } from '@/lib/ops/workspace/types'

interface Props {
  sections:      SectionDef[]
  activeSection: WorkspaceSection
  openTabs:      WorkspaceTab[]
  activeTabId:   string | null
  onTabChange:   (id: string) => void
  onTabClose:    (id: string) => void
  onAddTab:      () => void
}

export function WorkspaceTabs({
  sections,
  activeSection,
  openTabs,
  activeTabId,
  onTabChange,
  onTabClose,
  onAddTab,
}: Props) {
  // Don't show tabs if only the default overview tab exists
  if (openTabs.length <= 1) return null

  const getSectionIcon = (section: WorkspaceSection): string => {
    return sections.find(s => s.id === section)?.icon ?? '·'
  }

  return (
    <div className="flex items-center h-9 bg-gray-900/80 border-b border-gray-800 overflow-x-auto scrollbar-none flex-shrink-0">
      {openTabs.map(tab => {
        const isActive = tab.id === activeTabId || tab.section === activeSection
        return (
          <div
            key={tab.id}
            className={[
              'group flex items-center gap-1.5 px-3 h-full border-r border-gray-800 flex-shrink-0 cursor-pointer transition-colors min-w-0 max-w-[140px]',
              isActive
                ? 'bg-gray-800 text-gray-100 border-b-2 border-b-blue-500'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50',
            ].join(' ')}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="text-[10px] flex-shrink-0">{getSectionIcon(tab.section)}</span>
            <span className="text-[11px] font-medium truncate">{tab.label}</span>
            {tab.pinned ? (
              <span className="text-[9px] text-gray-600 flex-shrink-0">📌</span>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); onTabClose(tab.id) }}
                className="flex-shrink-0 text-[10px] text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity ml-auto pl-1"
                title="Cerrar tab"
              >
                ✕
              </button>
            )}
          </div>
        )
      })}

      {/* Add tab button */}
      <button
        onClick={onAddTab}
        className="h-full px-3 text-gray-600 hover:text-gray-300 hover:bg-gray-800/50 flex-shrink-0 transition-colors text-sm"
        title="Añadir tab para sección actual"
      >
        +
      </button>
    </div>
  )
}
