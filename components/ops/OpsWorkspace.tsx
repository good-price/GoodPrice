/**
 * components/ops/OpsWorkspace.tsx
 *
 * Main workspace shell for the GOODPRICE OPS console.
 * Wraps the admin page content with: sidebar, topbar, metrics strip,
 * tabs, command palette overlay, and floating dock.
 *
 * 'use client' — manages workspace state, keyboard shortcuts, scroll tracking.
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { SectionDef, OpsSnapshot, WorkspaceSection, WorkspaceState } from '@/lib/ops/workspace/types'
import { loadWorkspaceState, saveWorkspaceState, DEFAULT_WORKSPACE_STATE } from '@/lib/ops/workspace/workspace-state'
import { scrollToSection } from '@/lib/ops/workspace/workspace-layout'
import { OpsSidebar }        from './OpsSidebar'
import { OpsTopbar }         from './OpsTopbar'
import { CommandPalette }    from './CommandPalette'
import { PinnedMetrics }     from './PinnedMetrics'
import { WorkspaceTabs }     from './WorkspaceTabs'
import { FloatingActionDock } from './FloatingActionDock'
import { LiveExecutionFeed }  from './LiveExecutionFeed'

interface Props {
  snapshot: OpsSnapshot
  sections: SectionDef[]
  children: React.ReactNode
}

export function OpsWorkspace({ snapshot, sections, children }: Props) {
  // ── Client state ──────────────────────────────────────────────────────────
  const [wsState, setWsState] = useState<WorkspaceState>(DEFAULT_WORKSPACE_STATE)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const mainRef = useRef<HTMLElement>(null)

  // ── Load from localStorage on mount ──────────────────────────────────────
  useEffect(() => {
    const stored = loadWorkspaceState()
    setWsState(stored)
    setHydrated(true)
  }, [])

  // ── Persist on change ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return
    saveWorkspaceState(wsState)
  }, [wsState, hydrated])

  // ── Global keyboard shortcut ──────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(p => !p)
      }
      if (e.key === 'Escape' && paletteOpen) {
        setPaletteOpen(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [paletteOpen])

  // ── IntersectionObserver for active section ───────────────────────────────
  useEffect(() => {
    if (!hydrated) return

    const els = sections.map(s => document.getElementById(s.anchor)).filter(Boolean)
    if (els.length === 0) return

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible.length > 0) {
          const id = visible[0].target.id
          const section = sections.find(s => s.anchor === id)
          if (section) {
            setWsState(prev => {
              if (prev.activeSection === section.id) return prev
              return { ...prev, activeSection: section.id }
            })
          }
        }
      },
      { threshold: 0.15, rootMargin: '-10% 0px -60% 0px' },
    )

    els.forEach(el => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [hydrated, sections])

  // ── Callbacks ─────────────────────────────────────────────────────────────
  const toggleSidebar = useCallback(() => {
    setWsState(prev => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }))
  }, [])

  const navigateSection = useCallback((section: WorkspaceSection) => {
    const def = sections.find(s => s.id === section)
    if (!def) return
    setWsState(prev => ({ ...prev, activeSection: section }))
    scrollToSection(def.anchor)
    setPaletteOpen(false)
  }, [sections])

  const closePalette = useCallback(() => setPaletteOpen(false), [])

  const updatePinnedMetrics = useCallback((ids: string[]) => {
    setWsState(prev => ({ ...prev, pinnedMetricIds: ids }))
  }, [])

  // ── Derived ───────────────────────────────────────────────────────────────
  const collapsed      = wsState.sidebarCollapsed
  const activeSection  = wsState.activeSection
  const pinnedMetricIds = wsState.pinnedMetricIds

  if (!hydrated) {
    // SSR / hydration — render minimal chrome to avoid layout shift
    return (
      <div className="flex h-full w-full bg-gray-950">
        <div className="w-14 flex-shrink-0 bg-gray-900 border-r border-gray-800" />
        <div className="flex-1 flex flex-col">
          <div className="h-12 bg-gray-900 border-b border-gray-800" />
          <main className="flex-1 overflow-y-auto bg-gray-50">
            <div className="px-6 py-6">{children}</div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <OpsSidebar
        sections={sections}
        activeSection={activeSection}
        collapsed={collapsed}
        snapshot={snapshot}
        onNavigate={navigateSection}
        onToggle={toggleSidebar}
      />

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <OpsTopbar
          activeSection={activeSection}
          sections={sections}
          collapsed={collapsed}
          snapshot={snapshot}
          onToggleSidebar={toggleSidebar}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        {/* Pinned metrics strip */}
        {pinnedMetricIds.length > 0 && (
          <PinnedMetrics
            snapshot={snapshot}
            pinnedIds={pinnedMetricIds}
            onTogglePin={id => {
              updatePinnedMetrics(
                pinnedMetricIds.includes(id)
                  ? pinnedMetricIds.filter(i => i !== id)
                  : [...pinnedMetricIds, id],
              )
            }}
          />
        )}

        {/* Tab bar */}
        <WorkspaceTabs
          sections={sections}
          activeSection={activeSection}
          openTabs={wsState.openTabs}
          activeTabId={wsState.activeTabId}
          onTabChange={tabId => {
            const tab = wsState.openTabs.find(t => t.id === tabId)
            if (tab) navigateSection(tab.section)
            setWsState(prev => ({ ...prev, activeTabId: tabId }))
          }}
          onTabClose={tabId => {
            setWsState(prev => ({
              ...prev,
              openTabs: prev.openTabs.filter(t => t.id !== tabId || t.pinned),
              activeTabId: prev.activeTabId === tabId
                ? (prev.openTabs.find(t => t.id !== tabId)?.id ?? null)
                : prev.activeTabId,
            }))
          }}
          onAddTab={() => {
            const def = sections.find(s => s.id === activeSection)
            if (!def) return
            const exists = wsState.openTabs.some(t => t.section === activeSection)
            if (exists) return
            const newTab = {
              id:        `tab-${Date.now().toString(36)}`,
              label:     def.label,
              section:   activeSection,
              anchor:    def.anchor,
              pinned:    false,
              createdAt: new Date().toISOString(),
            }
            setWsState(prev => ({
              ...prev,
              openTabs: [...prev.openTabs, newTab],
              activeTabId: newTab.id,
            }))
          }}
        />

        {/* Scrollable main content */}
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900"
          id="workspace-main"
        >
          <div className="px-6 py-6 pb-20">
            {children}
          </div>
        </main>
      </div>

      {/* Command palette overlay */}
      {paletteOpen && (
        <CommandPalette
          onClose={closePalette}
          onNavigate={navigateSection}
        />
      )}

      {/* Floating action dock */}
      <FloatingActionDock />

      {/* Live execution feed (bottom-right, minimized) */}
      <LiveExecutionFeed initialEvents={snapshot.recentEvents} />
    </div>
  )
}
