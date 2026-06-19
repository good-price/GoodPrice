/**
 * components/admin/catalog/CatalogExecution.tsx
 *
 * Catalog Center — Zona 3: EXECUTION STATE
 *
 * Muestra el estado de la última ejecución del pipeline Auto Fill.
 * Solo lectura — leído desde data/catalog/catalog-execution.json.
 *
 * Campos mostrados:
 *   - Estado (isRunning / stage)
 *   - Categoría objetivo
 *   - Progreso (found / deficit, admitted)
 *   - Timestamps (startedAt / completedAt)
 *   - Pipeline ID
 *
 * Server Component.
 */

import type { CatalogExecutionState } from '@/lib/catalog/runtime/execution'
import { Card, SectionHeader, relativeTime, fmtDate } from '@/components/admin/shared'

interface Props {
  execution: CatalogExecutionState
}

const STAGE_META: Record<string, { label: string; color: string }> = {
  idle:        { label: 'Inactivo',     color: 'text-gray-400' },
  calculating: { label: 'Calculando',   color: 'text-blue-400' },  // Sprint 3E
  discovering: { label: 'Descubriendo', color: 'text-blue-500' },
  validating:  { label: 'Validando',    color: 'text-yellow-500' },
  admitting:   { label: 'Admitiendo',   color: 'text-green-500' },
  completed:   { label: 'Completado',   color: 'text-green-600' },  // Sprint 3E
  done:        { label: 'Completado',   color: 'text-green-600' },  // backward compat
  failed:      { label: 'Fallido',      color: 'text-red-500' },
}

export function CatalogExecution({ execution }: Props) {
  const stage = STAGE_META[execution.stage] ?? STAGE_META['idle']!
  const isIdle = execution.stage === 'idle' && !execution.startedAt

  return (
    <section>
      <SectionHeader>Estado de Ejecución</SectionHeader>

      {isIdle ? (
        <Card>
          <p className="text-sm text-gray-400 text-center py-4">
            Sin ejecuciones registradas.
          </p>
        </Card>
      ) : (
        <Card>
          {/* Status row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {execution.isRunning && (
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              )}
              <span className={`text-sm font-semibold ${stage.color}`}>
                {stage.label}
              </span>
              {execution.isRunning && (
                <span className="text-[10px] text-blue-500 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                  RUNNING
                </span>
              )}
            </div>
            {execution.category && (
              <span className="text-[11px] text-gray-500 font-mono capitalize">
                {execution.category}
              </span>
            )}
          </div>

          {/* Progress metrics */}
          {(execution.deficit > 0 || execution.found > 0 || execution.admitted > 0) && (
            <>
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Déficit</p>
                  <p className="text-xl font-bold text-gray-700 tabular-nums mt-0.5">{execution.deficit}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Encontrados</p>
                  <p className="text-xl font-bold text-blue-600 tabular-nums mt-0.5">{execution.found}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Validados</p>
                  <p className="text-xl font-bold text-yellow-600 tabular-nums mt-0.5">{execution.validated}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Preparados</p>
                  <p className="text-xl font-bold text-green-600 tabular-nums mt-0.5">{execution.admitted}</p>
                </div>
              </div>

              {/* Sprint 3G: iterations + remainingDeficit */}
              {(execution.iterations > 0 || execution.remainingDeficit > 0) && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="text-center">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Iteraciones</p>
                    <p className="text-lg font-bold text-indigo-600 tabular-nums mt-0.5">{execution.iterations}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Déficit rest.</p>
                    <p className="text-lg font-bold text-orange-600 tabular-nums mt-0.5">{execution.remainingDeficit}</p>
                  </div>
                </div>
              )}

              {/* Sprint 3H: multi-category progress */}
              {(execution.categoriesProcessed > 0) && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {execution.currentCategory && (
                    <div className="col-span-3 mb-1">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Categoría activa</p>
                      <p className="text-[12px] font-semibold text-blue-600 capitalize mt-0.5">{execution.currentCategory}</p>
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Procesadas</p>
                    <p className="text-lg font-bold text-gray-700 tabular-nums mt-0.5">{execution.categoriesProcessed}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Resueltas</p>
                    <p className="text-lg font-bold text-green-600 tabular-nums mt-0.5">{execution.categoriesResolved}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pools refr.</p>
                    <p className="text-lg font-bold text-indigo-500 tabular-nums mt-0.5">{execution.refreshedPools.length}</p>
                  </div>
                </div>
              )}

              {/* Batch progress */}
              {execution.totalBatches > 1 && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Batch</span>
                  <span className="font-mono text-[11px] text-gray-600">
                    {execution.currentBatch}/{execution.totalBatches}
                  </span>
                </div>
              )}

              {/* Current candidate */}
              {execution.currentCandidate && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Procesando</p>
                  <p className="font-mono text-[11px] text-gray-500">{execution.currentCandidate}</p>
                </div>
              )}

              {/* Last admitted ASIN */}
              {execution.lastAdmittedAsin && !execution.currentCandidate && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Último admitido</p>
                  <p className="font-mono text-[11px] text-green-600">{execution.lastAdmittedAsin}</p>
                </div>
              )}
            </>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            {execution.startedAt && (
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Iniciado</p>
                <p className="text-gray-700">{relativeTime(execution.startedAt)}</p>
                <p className="text-gray-400">{fmtDate(execution.startedAt)}</p>
              </div>
            )}
            {execution.completedAt && (
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Completado</p>
                <p className="text-gray-700">{relativeTime(execution.completedAt)}</p>
                <p className="text-gray-400">{fmtDate(execution.completedAt)}</p>
              </div>
            )}
          </div>

          {/* Pipeline ID */}
          {execution.pipelineId && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Pipeline ID</p>
              <p className="font-mono text-[11px] text-gray-500">{execution.pipelineId}</p>
            </div>
          )}

          {/* Errors */}
          {execution.errors.length > 0 && (
            <div className="mt-3 pt-3 border-t border-red-100">
              <p className="text-[10px] text-red-500 font-semibold uppercase tracking-wide mb-1">Errores</p>
              <ul className="space-y-0.5">
                {execution.errors.map((e, i) => (
                  <li key={i} className="text-[11px] text-red-600 font-mono">{e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings (Sprint 3H) */}
          {execution.warnings.length > 0 && (
            <div className="mt-3 pt-3 border-t border-yellow-100">
              <p className="text-[10px] text-yellow-600 font-semibold uppercase tracking-wide mb-1">Avisos</p>
              <ul className="space-y-0.5">
                {execution.warnings.map((w, i) => (
                  <li key={i} className="text-[11px] text-yellow-700 font-mono">{w}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </section>
  )
}
