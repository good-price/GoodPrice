/**
 * components/admin/AlertCenter.tsx  (UX-5)
 *
 * Superficie única de alertas del sistema.
 *
 * Consolida alertas de múltiples subsistemas en una vista priorizada:
 *   Critical primero (rojo), Warning después (amarillo).
 *
 * Retorna null si no hay alertas — jamás renderiza vacío.
 * No necesita 'use client' — server-safe.
 *
 * Reglas de diseño (UX-2):
 *   Critical → bg-red-50   border-red-100   badge rojo
 *   Warning  → bg-yellow-50 border-yellow-100 badge amarillo
 */

import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AlertItem {
  id:          string
  severity:    'critical' | 'warning' | 'info'
  title:       string
  description?: string
  subsystem?:  string
  suggestion?: string
}

interface Props {
  alerts:       AlertItem[]
  /** Href to full alert list — appends "Ver todos →" link */
  detailHref?:  string
  /** Max alerts per severity to display (default 3) */
  maxPerGroup?: number
}

// ── Severity badge ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border border-red-200',
    warning:  'bg-yellow-100 text-yellow-700 border border-yellow-200',
    info:     'bg-blue-100 text-blue-600 border border-blue-200',
  }
  const labels: Record<string, string> = {
    critical: 'CRÍTICO',
    warning:  'AVISO',
    info:     'INFO',
  }
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0 ${styles[severity] ?? 'bg-gray-100 text-gray-500'}`}>
      {labels[severity] ?? severity}
    </span>
  )
}

// ── Alert row ─────────────────────────────────────────────────────────────────

function AlertRow({ alert }: { alert: AlertItem }) {
  const bg: Record<string, string> = {
    critical: 'bg-red-50 border-red-100',
    warning:  'bg-yellow-50 border-yellow-100',
    info:     'bg-blue-50 border-blue-100',
  }
  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 border rounded-lg ${bg[alert.severity] ?? 'bg-gray-50 border-gray-100'}`}>
      <SeverityBadge severity={alert.severity} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800 leading-tight">{alert.title}</p>
        {alert.description && (
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{alert.description}</p>
        )}
        {alert.suggestion && (
          <p className="text-[10px] font-mono text-gray-400 mt-1">{alert.suggestion}</p>
        )}
      </div>
      {alert.subsystem && (
        <span className="text-[10px] text-gray-400 flex-shrink-0 pt-0.5 whitespace-nowrap">
          {alert.subsystem}
        </span>
      )}
    </div>
  )
}

// ── AlertCenter ───────────────────────────────────────────────────────────────

export function AlertCenter({ alerts, detailHref, maxPerGroup = 3 }: Props) {
  const critical = alerts.filter(a => a.severity === 'critical').slice(0, maxPerGroup)
  const warnings = alerts.filter(a => a.severity === 'warning').slice(0, maxPerGroup)
  const shown    = critical.length + warnings.length
  const hidden   = Math.max(0, alerts.filter(a => a.severity !== 'info').length - shown)

  // UX-3: return null — never render an empty alert center
  if (critical.length === 0 && warnings.length === 0) return null

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-2">
          Alert Center
          {critical.length > 0 && (
            <span className="text-[10px] font-bold text-red-600 normal-case tracking-normal bg-red-100 px-1.5 py-0.5 rounded-full">
              {critical.length} crítica{critical.length !== 1 ? 's' : ''}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="text-[10px] font-bold text-yellow-700 normal-case tracking-normal bg-yellow-100 px-1.5 py-0.5 rounded-full">
              {warnings.length} aviso{warnings.length !== 1 ? 's' : ''}
            </span>
          )}
        </h2>
        {detailHref && (
          <Link
            href={detailHref}
            className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
          >
            Ver todos →
          </Link>
        )}
      </div>

      {/* Alert rows — Critical first */}
      <div className="space-y-1.5">
        {critical.map(alert => <AlertRow key={alert.id} alert={alert} />)}
        {warnings.map(alert => <AlertRow key={alert.id} alert={alert} />)}

        {/* Hidden count — link to full list */}
        {hidden > 0 && detailHref && (
          <p className="text-[10px] text-gray-400 text-right pt-0.5">
            +{hidden} más en{' '}
            <Link href={detailHref} className="text-[#F7A823] font-medium hover:underline">
              Operaciones
            </Link>
          </p>
        )}
      </div>
    </section>
  )
}
