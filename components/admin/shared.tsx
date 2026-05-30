/**
 * components/admin/shared.tsx
 *
 * Shared UI primitives and formatting helpers used across all /admin/* pages.
 *
 * Color system (UX-2):
 *   Green   — Healthy, OK, success, accent
 *   Yellow  — Warning, degraded, needs attention
 *   Red     — Critical, error, suppressed
 *   Blue    — Informational, neutral counts
 *   Gray    — Inactive, zero, muted
 *
 * Server-safe — no client imports.
 */

// ── Formatting helpers ────────────────────────────────────────────────────────

export function fmtDate(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} ${time}`
}

export function relativeTime(iso: string | undefined): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'ahora mismo'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m atrás`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h atrás`
  return `${Math.floor(ms / 86_400_000)}d atrás`
}

export function parsePercent(pct: string): number {
  return parseFloat(pct.replace('%', '')) || 0
}

// ── Layout primitives ─────────────────────────────────────────────────────────

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
      {children}
    </h2>
  )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-gray-100 rounded-xl p-4 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

/**
 * StatCard — compact metric card.
 *
 * Color logic (UX-2):
 *   accent=true  → green  (healthy / good)
 *   warn=true    → red    (critical / error)
 *   info=true    → blue   (neutral / informational)
 *   default      → gray   (neutral count)
 *
 * hideIfZero=true → returns null when value is 0 or '0' (UX-3)
 */
export function StatCard({
  label,
  value,
  accent    = false,
  warn      = false,
  info      = false,
  hideIfZero = false,
}: {
  label:      string
  value:      string | number
  accent?:    boolean
  warn?:      boolean
  /** Blue — for informational / neutral metrics */
  info?:      boolean
  /** Hide this card entirely when value is 0 or '0' (UX-3) */
  hideIfZero?: boolean
}) {
  if (hideIfZero && (value === 0 || value === '0')) return null

  const color = accent ? 'text-green-600' : warn ? 'text-red-500' : info ? 'text-blue-600' : 'text-gray-900'
  return (
    <Card>
      <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </Card>
  )
}

/**
 * HealthBar — full-width color bar for the dominant health score.
 * Green ≥70, Yellow 40–69, Red <40.  (UX-2)
 */
export function HealthBar({ score, className = '' }: { score: number; className?: string }) {
  const color =
    score >= 70 ? 'bg-green-500' :
    score >= 40 ? 'bg-yellow-400' :
    'bg-red-500'
  return (
    <div className={`w-full bg-gray-100 rounded-full h-2 overflow-hidden ${className}`}>
      <div
        className={`${color} h-2 rounded-full transition-all duration-500`}
        style={{ width: `${Math.min(score, 100)}%` }}
      />
    </div>
  )
}

export function ClickBar({ share }: { share: string }) {
  const val = Math.min(parsePercent(share), 100)
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className="bg-[#F7A823] h-1.5 rounded-full transition-all" style={{ width: `${val}%` }} />
      </div>
      <span className="text-xs tabular-nums text-gray-600 w-12 text-right">{share}</span>
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <p className="text-center text-sm text-gray-400 py-6">{message}</p>
    </Card>
  )
}

export function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide pb-2 pr-4 whitespace-nowrap">
      {children}
    </th>
  )
}

export function Td({
  children,
  mono  = false,
  muted = false,
}: {
  children: React.ReactNode
  mono?:    boolean
  muted?:   boolean
}) {
  return (
    <td className={`py-2 pr-4 text-sm align-middle ${mono ? 'font-mono text-xs' : ''} ${muted ? 'text-gray-400' : 'text-gray-700'}`}>
      {children}
    </td>
  )
}

export function GradeBadge({ grade }: { grade: string }) {
  const map: Record<string, string> = {
    A: 'bg-green-100 text-green-700',
    B: 'bg-green-100 text-green-600',  // UX-2: B is good, stays green (lighter)
    C: 'bg-yellow-100 text-yellow-700',
    D: 'bg-red-100 text-red-600',      // UX-2: D is warning-level, use red-light
    F: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${map[grade] ?? 'bg-gray-100 text-gray-400'}`}>
      {grade}
    </span>
  )
}

/**
 * ScoreBar — inline score visualization.
 *
 * Color system (UX-2):
 *   ≥90 → green-500   (excellent)
 *   ≥70 → green-400   (good — previously blue-400, normalized)
 *   ≥50 → yellow-400  (warning)
 *   ≥30 → orange-400  (degraded)
 *   <30 → red-500     (critical)
 */
export function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 90 ? 'bg-green-500' :
    score >= 70 ? 'bg-green-400' :   // UX-2 fix: was bg-blue-400
    score >= 50 ? 'bg-yellow-400' :
    score >= 30 ? 'bg-orange-400' :
    'bg-red-500'
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs tabular-nums text-gray-600 w-8 text-right">{score}</span>
    </div>
  )
}
