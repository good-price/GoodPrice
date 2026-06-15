/**
 * components/ops/CatalogTable.tsx
 *
 * Full-featured operator catalog table.
 * Features: search, tier filter, sort, pagination, multi-select, bulk actions.
 * Receives pre-built rows from the server; mutations trigger router.refresh().
 * 'use client' — requires interaction.
 */

'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter }                       from 'next/navigation'
import type { CatalogTableRow }            from '@/lib/ops/actions/types'
import { ProductStateBadge }               from './ProductStateBadge'
import { ProductActionsMenu }              from './ProductActionsMenu'
import { BulkActionBar }                   from './BulkActionBar'
import { ProductDrawer }                   from './ProductDrawer'

// ── Filter / sort / priority state ────────────────────────────────────────────

type TierFilter    = 'all' | 'active' | 'warning' | 'degraded' | 'suppressed' | 'quarantined' | 'archived'
type SortField     = 'title' | 'score' | 'price' | 'tier' | 'none'
type SortDir       = 'asc' | 'desc'
type PriorityView  = 'all' | 'no-image' | 'recoverable' | 'high-risk'

const TIER_ORDER: Record<string, number> = {
  active: 0, warning: 1, degraded: 2, suppressed: 3, quarantined: 4, archived: 5,
}

// P1.2 — single source of truth for "recoverable" predicate
function isRecoverableRow(r: CatalogTableRow): boolean {
  return (
    r.tier === 'suppressed' &&
    r.productStatus === 'active' &&
    r.suppressionReason !== null &&
    !r.suppressionReason.toLowerCase().includes('cuarentena') &&
    !r.suppressionReason.toLowerCase().includes('inactivo') &&
    !r.suppressionReason.toLowerCase().includes('asin inválido')
  )
}

const PAGE_SIZE = 25

// ── Score bar ──────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)))
  const color =
    pct >= 70 ? 'bg-green-500' :
    pct >= 40 ? 'bg-yellow-400' :
                'bg-red-400'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">{pct}</span>
    </div>
  )
}

// ── Colombia cell ──────────────────────────────────────────────────────────────

function ColombiaBadge({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-gray-400 text-[10px]">—</span>
  return ok
    ? <span className="text-green-600 dark:text-green-400 text-[10px] font-bold">✓ CO</span>
    : <span className="text-orange-500 dark:text-orange-400 text-[10px] font-bold">⚠ CO</span>
}

// ── Pricing cell ───────────────────────────────────────────────────────────────

function PricingCell({ price, hasFakeDiscount, score }: {
  price: number
  hasFakeDiscount: boolean
  score: number | null
}) {
  return (
    <div className="text-right">
      <p className="text-xs font-mono text-gray-800 dark:text-gray-200">
        ${price.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </p>
      {hasFakeDiscount && (
        <span className="text-[9px] text-orange-500 font-semibold">descuento falso</span>
      )}
      {!hasFakeDiscount && score !== null && (
        <span className={`text-[9px] ${score >= 0.7 ? 'text-green-500' : score >= 0.4 ? 'text-yellow-500' : 'text-red-500'}`}>
          truth {Math.round(score * 100)}
        </span>
      )}
    </div>
  )
}

// ── Status pill ────────────────────────────────────────────────────────────────

function StatusPill({ row }: { row: CatalogTableRow }) {
  const chips: { label: string; cls: string }[] = []

  if (row.hasOverride && row.overrideTier) {
    chips.push({ label: `✎ ${row.overrideTier}`, cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' })
  }
  if (row.riskLevel) {
    const cls =
      row.riskLevel === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
      row.riskLevel === 'high'     ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' :
      row.riskLevel === 'medium'   ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' :
                                     'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
    chips.push({ label: `⚑ ${row.riskLevel}`, cls })
  }
  if (row.hasNote) {
    chips.push({ label: '📝', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' })
  }

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <span key={i} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${c.cls}`}>
          {c.label}
        </span>
      ))}
    </div>
  )
}

// ── Filter bar ─────────────────────────────────────────────────────────────────

interface FilterBarProps {
  search:          string
  onSearch:        (v: string) => void
  tierFilter:      TierFilter
  onTierFilter:    (v: TierFilter) => void
  onlyOverride:    boolean
  onToggleOverride: () => void
  onlyRisk:        boolean
  onToggleRisk:    () => void
  onlyNoClicks:    boolean
  onToggleNoClicks: () => void
  hasClickData:    boolean
  total:           number
  filtered:        number
  tierCounts:      Partial<Record<TierFilter, number>>
  overrideCount:   number
  riskCount:       number
}

const TIER_ALWAYS_VISIBLE = new Set<TierFilter>(['all', 'active', 'quarantined'])

const ALL_TIERS: { value: TierFilter; label: string }[] = [
  { value: 'all',         label: 'Todos'       },
  { value: 'active',      label: 'Activos'     },
  { value: 'warning',     label: 'Warning'     },
  { value: 'degraded',    label: 'Degradados'  },
  { value: 'suppressed',  label: 'Suprimidos'  },
  { value: 'quarantined', label: 'Cuarentena'  },
  { value: 'archived',    label: 'Archivados'  },
]

function FilterBar({
  search, onSearch,
  tierFilter, onTierFilter,
  onlyOverride, onToggleOverride,
  onlyRisk, onToggleRisk,
  onlyNoClicks, onToggleNoClicks,
  hasClickData,
  total, filtered,
  tierCounts,
  overrideCount,
  riskCount,
}: FilterBarProps) {
  const visibleTiers = ALL_TIERS.filter(
    t => TIER_ALWAYS_VISIBLE.has(t.value) || (tierCounts[t.value] ?? 0) > 0,
  )

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px]">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Buscar título, ASIN…"
          className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Tier filter — only show tiers that have products (except always-visible ones) */}
      <div className="flex items-center gap-1">
        {visibleTiers.map(t => (
          <button
            key={t.value}
            onClick={() => onTierFilter(t.value)}
            className={[
              'text-[10px] font-semibold px-2 py-1 rounded transition-all',
              tierFilter === t.value
                ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Toggle chips — only show when count > 0 */}
      <div className="flex items-center gap-1.5 ml-auto">
        {overrideCount > 0 && (
          <button
            onClick={onToggleOverride}
            className={[
              'text-[10px] font-semibold px-2 py-1 rounded-full border transition-all',
              onlyOverride
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400',
            ].join(' ')}
          >
            ✎ Override
          </button>
        )}
        {riskCount > 0 && (
          <button
            onClick={onToggleRisk}
            className={[
              'text-[10px] font-semibold px-2 py-1 rounded-full border transition-all',
              onlyRisk
                ? 'bg-orange-500 text-white border-orange-500'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400',
            ].join(' ')}
          >
            ⚑ Riesgo
          </button>
        )}
        {hasClickData && (
          <button
            onClick={onToggleNoClicks}
            className={[
              'text-[10px] font-semibold px-2 py-1 rounded-full border transition-all',
              onlyNoClicks
                ? 'bg-red-600 text-white border-red-600'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400',
            ].join(' ')}
          >
            ○ Sin clicks
          </button>
        )}
        <span className="text-[10px] text-gray-400 ml-1">
          {filtered === total ? `${total}` : `${filtered} / ${total}`}
        </span>
      </div>
    </div>
  )
}

// ── Sort header cell ───────────────────────────────────────────────────────────

// ── B7: Priority view tab bar ─────────────────────────────────────────────────

interface PriorityBarProps {
  active:   PriorityView
  onChange: (v: PriorityView) => void
  counts:   Record<PriorityView, number>
}

const PRIORITY_DEFS: { id: PriorityView; label: string }[] = [
  { id: 'all',         label: 'Todos'        },
  { id: 'no-image',    label: 'Sin imagen'   },
  { id: 'recoverable', label: 'Recuperables' },
  { id: 'high-risk',   label: 'Riesgo alto'  },
]

function PriorityBar({ active, onChange, counts }: PriorityBarProps) {
  const visibleDefs = PRIORITY_DEFS.filter(({ id }) => id === 'all' || counts[id] > 0)
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 overflow-x-auto scrollbar-none">
      {visibleDefs.map(({ id, label }) => {
        const isActive = active === id
        const count    = counts[id]
        const hasAlert = id !== 'all' && count > 0
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={[
              'flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all',
              isActive
                ? id === 'high-risk'
                  ? 'bg-red-600 text-white'
                  : id === 'recoverable'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900'
                : hasAlert
                  ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-400'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
            ].join(' ')}
          >
            {label}
            {count > 0 && (
              <span className={`text-[9px] font-bold rounded-full px-1 ${
                isActive
                  ? 'bg-white/20 text-white'
                  : id === 'high-risk'
                    ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
              }`}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Sort header cell ──────────────────────────────────────────────────────────

function SortTh({
  field, label, current, dir, onSort, className = '',
}: {
  field:    SortField
  label:    string
  current:  SortField
  dir:      SortDir
  onSort:   (f: SortField) => void
  className?: string
}) {
  const active = current === field
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-3 py-2 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-800 dark:hover:text-gray-200 select-none ${className}`}
    >
      {label}
      {active && (
        <span className="ml-1 text-blue-500">{dir === 'asc' ? '↑' : '↓'}</span>
      )}
    </th>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  initialRows: CatalogTableRow[]
}

export function CatalogTable({ initialRows }: Props) {
  const router = useRouter()

  // Filter / sort state
  const [search,       setSearch]       = useState('')
  const [tierFilter,   setTierFilter]   = useState<TierFilter>('all')
  const [onlyOverride,  setOnlyOverride]  = useState(false)
  const [onlyRisk,      setOnlyRisk]      = useState(false)
  const [onlyNoClicks,  setOnlyNoClicks]  = useState(false)
  const [priorityView,  setPriorityView]  = useState<PriorityView>('all')
  const [openDrawer,    setOpenDrawer]    = useState<CatalogTableRow | null>(null)
  const [sortField,    setSortField]    = useState<SortField>('none')
  const [sortDir,      setSortDir]      = useState<SortDir>('desc')
  const [page,         setPage]         = useState(1)

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // ── Filter + sort ─────────────────────────────────────────────────────────────

  const hasClickData = useMemo(
    () => initialRows.some(r => r.clickCount >= 0),
    [initialRows],
  )

  // Counts per priority view (computed over all rows, not filtered)
  const priorityCounts = useMemo((): Record<PriorityView, number> => ({
    all:         initialRows.length,
    'no-image':  initialRows.filter(r => r.imageIssue).length,
    recoverable: initialRows.filter(isRecoverableRow).length,
    'high-risk': initialRows.filter(r => r.riskLevel === 'high' || r.riskLevel === 'critical').length,
  }), [initialRows])

  // Counts for dynamic filter chips and tier tabs
  const tierCounts = useMemo((): Partial<Record<TierFilter, number>> => {
    const counts: Partial<Record<TierFilter, number>> = {}
    for (const row of initialRows) {
      const key = row.tier as TierFilter
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [initialRows])

  const overrideCount = useMemo(() => initialRows.filter(r => r.hasOverride).length, [initialRows])
  const anyRiskCount  = useMemo(() => initialRows.filter(r => r.riskLevel !== null).length, [initialRows])

  const showPriorityBar = priorityCounts['no-image'] > 0 || priorityCounts.recoverable > 0 || priorityCounts['high-risk'] > 0

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = initialRows

    if (q) {
      rows = rows.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.asin.toLowerCase().includes(q)  ||
        r.category.toLowerCase().includes(q)
      )
    }
    if (tierFilter !== 'all') {
      rows = rows.filter(r => r.tier === tierFilter)
    }
    if (onlyOverride) {
      rows = rows.filter(r => r.hasOverride)
    }
    if (onlyRisk) {
      rows = rows.filter(r => r.riskLevel !== null)
    }
    if (onlyNoClicks) {
      rows = rows.filter(r => r.clickCount === 0)
    }

    // Priority view filters (degraded/suppressed/no-clicks are handled by FilterBar)
    if (priorityView === 'no-image') {
      rows = rows.filter(r => r.imageIssue)
    } else if (priorityView === 'recoverable') {
      rows = rows.filter(isRecoverableRow)
    } else if (priorityView === 'high-risk') {
      rows = rows.filter(r => r.riskLevel === 'high' || r.riskLevel === 'critical')
    }

    if (sortField !== 'none') {
      rows = [...rows].sort((a, b) => {
        let cmp = 0
        if (sortField === 'title') {
          cmp = a.title.localeCompare(b.title, 'es')
        } else if (sortField === 'score') {
          cmp = a.publicScore - b.publicScore
        } else if (sortField === 'price') {
          cmp = a.price - b.price
        } else if (sortField === 'tier') {
          cmp = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9)
        }
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return rows
  }, [initialRows, search, tierFilter, onlyOverride, onlyRisk, onlyNoClicks, priorityView, sortField, sortDir])

  // ── Pagination ────────────────────────────────────────────────────────────────

  const totalPages  = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const safePage    = Math.min(page, totalPages)
  const pageStart   = (safePage - 1) * PAGE_SIZE
  const visibleRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE)

  // ── Sort handler ──────────────────────────────────────────────────────────────

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
    setPage(1)
  }

  // ── Filter handlers ───────────────────────────────────────────────────────────

  function handleSearch(v: string) { setSearch(v); setPage(1) }
  function handleTierFilter(v: TierFilter) { setTierFilter(v); setPage(1) }

  // ── Selection ─────────────────────────────────────────────────────────────────

  const visibleIds     = visibleRows.map(r => r.productId)
  const allPageSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id))
  const someSelected    = visibleIds.some(id => selected.has(id))

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allPageSelected) {
        visibleIds.forEach(id => next.delete(id))
      } else {
        visibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  function onActionComplete() {
    router.refresh()
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const selectedRowObjs = useMemo(
    () => initialRows.filter(r => selected.has(r.productId)),
    [initialRows, selected],
  )

  function handleRowClick(row: CatalogTableRow) {
    setOpenDrawer(prev => prev?.productId === row.productId ? null : row)
  }

  // Apply priority view: reset search/tier filters for clean UX
  function handlePriorityChange(v: PriorityView) {
    setPriorityView(v)
    if (v === 'high-risk') { setOnlyRisk(false) }
    setPage(1)
  }

  return (
    <div className="relative">
      {/* B7: Priority view tabs — hidden when all priority counts are 0 */}
      {showPriorityBar && (
        <PriorityBar
          active={priorityView}
          onChange={handlePriorityChange}
          counts={priorityCounts}
        />
      )}

      {/* Filter bar */}
      <FilterBar
        search={search}               onSearch={handleSearch}
        tierFilter={tierFilter}       onTierFilter={handleTierFilter}
        onlyOverride={onlyOverride}   onToggleOverride={() => { setOnlyOverride(v => !v); setPage(1) }}
        onlyRisk={onlyRisk}           onToggleRisk={() => { setOnlyRisk(v => !v); setPage(1) }}
        onlyNoClicks={onlyNoClicks}   onToggleNoClicks={() => { setOnlyNoClicks(v => !v); setPage(1) }}
        hasClickData={hasClickData}
        total={initialRows.length}    filtered={filteredRows.length}
        tierCounts={tierCounts}
        overrideCount={overrideCount}
        riskCount={anyRiskCount}
      />

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              {/* Checkbox */}
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  ref={el => { if (el) el.indeterminate = someSelected && !allPageSelected }}
                  onChange={toggleAll}
                  className="rounded cursor-pointer"
                />
              </th>

              {/* Columns */}
              <SortTh field="title" label="Producto"    current={sortField} dir={sortDir} onSort={handleSort} className="min-w-[240px]" />
              <SortTh field="tier"  label="Tier"        current={sortField} dir={sortDir} onSort={handleSort} />
              <SortTh field="score" label="Score"       current={sortField} dir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">CO</th>
              <SortTh field="price" label="Precio"      current={sortField} dir={sortDir} onSort={handleSort} className="text-right" />
              <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>

          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                  Sin productos para los filtros seleccionados.
                </td>
              </tr>
            ) : (
              visibleRows.map(row => {
                const isSelected   = selected.has(row.productId)
                const isDrawerOpen = openDrawer?.productId === row.productId
                return (
                  <tr
                    key={row.productId}
                    onClick={() => handleRowClick(row)}
                    className={[
                      'border-b border-gray-100 dark:border-gray-800 transition-colors cursor-pointer',
                      isDrawerOpen
                        ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-inset ring-blue-300 dark:ring-blue-700'
                        : isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/10'
                          : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50',
                    ].join(' ')}
                  >
                    {/* Checkbox — stop propagation so click doesn't open drawer */}
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(row.productId)}
                        className="rounded cursor-pointer"
                      />
                    </td>

                    {/* Product info */}
                    <td className="px-3 py-2.5 max-w-[280px]">
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate leading-tight">
                        {row.title}
                      </p>
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                        {row.asin}
                        {row.category && (
                          <span className="ml-1 text-gray-300 dark:text-gray-600">· {row.category}</span>
                        )}
                      </p>
                      {row.suppressionReason && (
                        <p className="text-[9px] text-red-400 dark:text-red-500 mt-0.5 leading-tight truncate" title={row.suppressionReason}>
                          {row.suppressionReason}
                        </p>
                      )}
                    </td>

                    {/* Tier badge */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <ProductStateBadge
                        tier={row.tier}
                        hasOverride={row.hasOverride}
                        compact
                      />
                    </td>

                    {/* Score bar */}
                    <td className="px-3 py-2.5">
                      <ScoreBar score={row.publicScore} />
                    </td>

                    {/* Colombia */}
                    <td className="px-3 py-2.5">
                      <ColombiaBadge ok={row.colombiaOk} />
                    </td>

                    {/* Pricing */}
                    <td className="px-3 py-2.5">
                      <PricingCell
                        price={row.price}
                        hasFakeDiscount={row.hasFakeDiscount}
                        score={row.pricingTruthScore}
                      />
                    </td>

                    {/* Status chips */}
                    <td className="px-3 py-2.5">
                      <StatusPill row={row} />
                    </td>

                    {/* Actions menu — stop propagation so click doesn't open drawer */}
                    <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                      <ProductActionsMenu
                        productId={row.productId}
                        productTitle={row.title}
                        currentTier={row.tier}
                      />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <p className="text-xs text-gray-500">
            {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredRows.length)} de {filteredRows.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40 transition-colors"
            >
              «
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40 transition-colors"
            >
              ‹
            </button>
            {/* Page numbers */}
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(totalPages - 6, safePage - 3)) + i
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={[
                    'text-xs w-7 h-7 rounded border transition-colors',
                    p === safePage
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200',
                  ].join(' ')}
                >
                  {p}
                </button>
              )
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40 transition-colors"
            >
              ›
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
              className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40 transition-colors"
            >
              »
            </button>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      <BulkActionBar
        selectedIds={Array.from(selected)}
        selectedRows={selectedRowObjs}
        onClearSelection={clearSelection}
        onActionComplete={onActionComplete}
      />

      {/* Bottom padding when bulk bar is visible */}
      {selected.size > 0 && <div className="h-24" />}

      {/* B1: Product drawer */}
      <ProductDrawer
        row={openDrawer}
        onClose={() => setOpenDrawer(null)}
      />
    </div>
  )
}
