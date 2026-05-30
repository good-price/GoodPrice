/**
 * lib/ops/execution/job-runner.ts
 *
 * Executes individual catalog jobs by calling the underlying library functions.
 *
 * Each job type maps to one or more catalog subsystem calls.
 * Progress is written to the job store at each checkpoint.
 *
 * Jobs that process products in a loop check isJobCancelled() before each
 * item and bail out early if the operator cancelled the run.
 *
 * SERVER-ONLY.
 */

import { buildTrustReport, saveTrustReport }           from '@/lib/catalog/trust/reports'
import { invalidateVisibilityContext }                  from '@/lib/catalog/trust/visibility-engine'
import { runCatalogRepair }                             from '@/lib/catalog/repair'
import { runHealingCycle }                              from '@/lib/catalog/self-healing'
import { syncImages }                                   from '@/lib/paapi/image-sync'
import { getPublicProducts }                            from '@/lib/catalog/public'
import { getColombiaProducts }                          from '@/data/catalog'
import { isValidAsinFormat }                            from '@/lib/catalog/validator'
import { getCachedSnapshot }                            from '@/lib/catalog/intelligence/snapshot'
import {
  validateProduct,
  loadAllResults,
  loadProductHistory,
  saveResult,
  cacheResult,
  buildReport  as buildTruthReport,
  saveReport   as saveTruthReport,
  buildQueue,
  dequeueNext,
  saveQueue,
} from '@/lib/catalog/live-truth'
import {
  loadLinkHealthCache,
  saveLinkHealthCache,
  checkAmazonLink,
  type LinkHealthEntry,
} from '@/lib/catalog/link-health'
import {
  loadColombiaCache,
  saveColombiaCache,
  checkColombiaAvailability,
  type ColombiaAvailabilityEntry,
} from '@/lib/catalog/colombia-availability'
import { bulkQuarantine, isQuarantined }                from '@/lib/audit/quarantine'

import type { ExecJob, ExecJobResult }                  from './types'
import { updateJob, isJobCancelled }                    from './queue-engine'
import { makeProgressUpdater }                          from './progress-engine'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runBatched<T, R>(
  items:       T[],
  concurrency: number,
  delayMs:     number,
  fn:          (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch       = items.slice(i, i + concurrency)
    const batchResult = await Promise.all(batch.map(fn))
    results.push(...batchResult)
    if (i + concurrency < items.length && delayMs > 0) {
      await sleep(delayMs)
    }
  }
  return results
}

// ── Job executors ─────────────────────────────────────────────────────────────

async function runTrustRecompute(job: ExecJob): Promise<ExecJobResult> {
  const updater = makeProgressUpdater(job.id, Date.now())
  updater.setTotal(1)

  invalidateVisibilityContext()
  const report = buildTrustReport()
  saveTrustReport(report)

  updater.advance('processed')
  updater.flush()

  return {
    summary:  `Trust recomputed — ${report.visible}/${report.totalProducts} visibles, score promedio ${report.avgPublicScore}/100`,
    affected: report.totalProducts,
    warnings: report.suppressed > 0 ? [`${report.suppressed} productos suprimidos`] : [],
    errors:   [],
    data: {
      active:    report.active,
      warning:   report.warning,
      degraded:  report.degraded,
      suppressed: report.suppressed,
      visible:   report.visible,
      avgScore:  report.avgPublicScore,
    },
  }
}

async function runRepair(job: ExecJob): Promise<ExecJobResult> {
  const opts    = job.options
  const startMs = Date.now()
  const updater = makeProgressUpdater(job.id, startMs)

  const result = await runCatalogRepair({
    limit:               typeof opts.limit === 'number' ? opts.limit : 20,
    dryRun:              opts.dryRun === true,
    confidenceThreshold: typeof opts.confidenceThreshold === 'number' ? opts.confidenceThreshold : 85,
  })

  updater.setTotal(result.jobs.length)
  for (const j of result.jobs) {
    updater.advance(j.patches && j.patches.length > 0 ? 'repaired' : 'processed', j.asin)
  }
  updater.flush()

  const errors = result.jobs.filter(j => j.error).map(j => `${j.asin}: ${j.error}`)

  return {
    summary:  `Repair: ${result.autoRepaired} reparados, ${result.noCandidate} sin candidato, ${result.manualReview} revisión manual`,
    affected: result.autoRepaired,
    warnings: result.needsPaapi > 0 ? [`${result.needsPaapi} productos necesitan PA-API`] : [],
    errors:   errors.slice(0, 10),
    data: {
      autoRepaired: result.autoRepaired,
      manualReview: result.manualReview,
      noCandidate:  result.noCandidate,
      needsPaapi:   result.needsPaapi,
      processed:    result.processed,
    },
  }
}

async function runLiveTruth(job: ExecJob): Promise<ExecJobResult> {
  const opts    = job.options
  const limit   = Math.min(Number(opts.limit) || 10, 20)
  const delayMs = Math.min(Number(opts.delayMs) || 2_000, 5_000)
  const startMs = Date.now()
  const updater = makeProgressUpdater(job.id, startMs)

  const publicProducts  = getPublicProducts()
  const existingResults = loadAllResults()

  // Build queue
  const snapshot    = getCachedSnapshot()
  const trendingIds = new Set<string>(snapshot?.promotedIds ?? [])
  const summary     = Object.fromEntries(
    Object.entries(existingResults).map(([id, r]) => [
      id, { checkedAt: r.checkedAt, truthScore: r.truthScore },
    ]),
  )
  const queue = buildQueue({ products: publicProducts.filter(p => p.asin && p.id), existingResults: summary, trendingIds })
  saveQueue(queue)

  const due = dequeueNext(queue, limit, Number(opts.minIntervalHours) || 6)
  const toValidate = due
    .map(item => publicProducts.find(p => p.id === item.productId))
    .filter((p): p is NonNullable<typeof p> => p !== undefined && !!p.id && !!p.asin)

  updater.setTotal(toValidate.length)

  const errors: string[] = []

  for (let i = 0; i < toValidate.length; i++) {
    if (isJobCancelled(job.id)) break

    const product = toValidate[i]
    try {
      const history   = loadProductHistory(product.id!)
      const prevCheck = existingResults[product.id!]?.checkedAt ?? null
      const result    = await validateProduct(product, history, prevCheck)
      saveResult(result)
      cacheResult(result)

      updater.advance('processed', product.asin)
    } catch (err) {
      errors.push(`${product.asin}: ${String(err).slice(0, 80)}`)
      updater.advance('failed', product.asin)
    }

    if (i < toValidate.length - 1) await sleep(delayMs)
  }

  // Rebuild report + queue
  const allResults = loadAllResults()
  const report     = buildTruthReport(allResults, publicProducts.length)
  saveTruthReport(report)

  const updatedQ = buildQueue({
    products:        publicProducts.filter(p => p.asin && p.id),
    existingResults: Object.fromEntries(
      Object.entries(allResults).map(([id, r]) => [id, { checkedAt: r.checkedAt, truthScore: r.truthScore }]),
    ),
    trendingIds,
  })
  saveQueue(updatedQ)

  updater.flush()

  return {
    summary:  `Live Truth: ${updater.get().processed} validados, ${errors.length} errores`,
    affected: updater.get().processed,
    warnings: [],
    errors:   errors.slice(0, 10),
    data: {
      checked:     updater.get().processed,
      avgScore:    report.avgTruthScore,
      validCount:  report.validCount,
      queueSize:   updatedQ.items.length,
    },
  }
}

async function runLinkAudit(job: ExecJob): Promise<ExecJobResult> {
  const opts        = job.options
  const maxProducts = Math.min(Number(opts.maxProducts) || 20, 50)
  const offset      = Number(opts.offset) || 0
  const dryRun      = opts.dryRun === true
  const startMs     = Date.now()
  const updater     = makeProgressUpdater(job.id, startMs)

  const eligible = getColombiaProducts()
    .filter(p => p.asin && isValidAsinFormat(p.asin) && p.status !== 'inactive')
  const products = eligible.slice(offset, offset + maxProducts)

  updater.setTotal(products.length)

  const existing = loadLinkHealthCache()
  const entries: Record<string, LinkHealthEntry> = existing?.entries ? { ...existing.entries } : {}

  let alive = 0, dead = 0, rateLimited = 0, autoQuarantined = 0

  type DeadProduct = { productId: string; asin: string; title: string; category: string; consecutiveFails: number }
  const deadProducts: DeadProduct[] = []

  await runBatched(products, 3, 800, async (product) => {
    if (isJobCancelled(job.id)) return

    const id   = product.id
    const asin = product.asin!

    try {
      const result          = await checkAmazonLink(asin)
      const prev            = entries[id]
      const isDeadNow       = result.status === 'dead'
      const consecutiveFails = isDeadNow
        ? ((prev?.status === 'dead' ? (prev.consecutiveFails ?? 0) : 0) + 1)
        : 0

      entries[id] = {
        productId: id, asin,
        status:    result.status,
        httpStatus: result.httpStatus,
        checkedAt:  new Date().toISOString(),
        consecutiveFails,
        failureReason:  result.failureReason,
        redirectTarget: result.redirectTarget,
      }

      switch (result.status) {
        case 'alive':        alive++;        break
        case 'dead':         dead++;         break
        case 'rate-limited': rateLimited++;  break
      }

      if (isDeadNow && consecutiveFails >= 2) {
        deadProducts.push({ productId: id, asin, title: product.title, category: product.category, consecutiveFails })
      }

      updater.advance(isDeadNow ? 'failed' : 'processed', asin)
    } catch {
      updater.advance('failed', asin)
    }
  })

  if (!dryRun) {
    saveLinkHealthCache({ generatedAt: new Date().toISOString(), entries })

    const toQ = deadProducts.filter(p => !isQuarantined(p.productId))
    if (toQ.length > 0) {
      const q = bulkQuarantine(toQ.map(p => ({
        productId: p.productId, asin: p.asin, title: p.title, category: p.category,
        reason: `Enlace Amazon inaccesible — ${p.consecutiveFails} auditorías consecutivas`,
        quarantinedBy: 'audit' as const,
      })))
      autoQuarantined = q.added
    }
  }

  updater.flush()

  return {
    summary:  `Link Audit: ${alive} vivos, ${dead} muertos, ${rateLimited} rate-limited`,
    affected: products.length,
    warnings: dead > 0 ? [`${dead} enlaces muertos detectados`] : [],
    errors:   autoQuarantined > 0 ? [`${autoQuarantined} productos auto-quarantinados`] : [],
    data: { alive, dead, rateLimited, autoQuarantined, offset, totalEligible: eligible.length },
  }
}

async function runColombiaAudit(job: ExecJob): Promise<ExecJobResult> {
  const opts        = job.options
  const maxProducts = Math.min(Number(opts.maxProducts) || 20, 50)
  const offset      = Number(opts.offset) || 0
  const dryRun      = opts.dryRun === true
  const startMs     = Date.now()
  const updater     = makeProgressUpdater(job.id, startMs)

  const allEligible = getColombiaProducts()
    .filter(p => p.asin && isValidAsinFormat(p.asin) && p.status !== 'inactive')

  const existing = loadColombiaCache()
  const entries: Record<string, ColombiaAvailabilityEntry> = existing?.entries ? { ...existing.entries } : {}

  const now = new Date().toISOString()
  let available = 0, unavailable = 0, rateLimited = 0, autoQuarantined = 0
  let catalogFieldResolved = 0

  // Pass 1: catalog fields
  for (const product of allEligible) {
    const id = product.id
    if (product.shipsToColombiaConfirmed === false) {
      const prev  = entries[id]
      const cFail = (prev?.status === 'unavailable' ? (prev.consecutiveFails ?? 0) : 0) + 1
      entries[id] = {
        productId: id, asin: product.asin!, status: 'unavailable',
        source: 'catalog-field', httpStatus: null, checkedAt: now,
        consecutiveFails: cFail, amazonGlobalEligible: false,
        hasImportFees: false, restrictionSignals: ['shipsToColombiaConfirmed: false'],
        failureReason: 'Catálogo indica no envía a Colombia',
      }
      unavailable++; catalogFieldResolved++
    } else if (product.shipsToColombiaConfirmed === true) {
      entries[id] = {
        productId: id, asin: product.asin!, status: 'available',
        source: 'catalog-field', httpStatus: null, checkedAt: now,
        consecutiveFails: 0, amazonGlobalEligible: true,
        hasImportFees: null, restrictionSignals: [], failureReason: null,
      }
      available++; catalogFieldResolved++
    }
  }

  // Pass 2: live check
  const liveCandidates = allEligible.filter(
    p => p.shipsToColombiaConfirmed === undefined || p.shipsToColombiaConfirmed === null,
  )
  const liveSlice = liveCandidates.slice(offset, offset + maxProducts)
  updater.setTotal(liveSlice.length)

  type QuarCandidate = { productId: string; asin: string; title: string; category: string; consecutiveFails: number }
  const quarCandidates: QuarCandidate[] = []

  await runBatched(liveSlice, 3, 800, async (product) => {
    if (isJobCancelled(job.id)) return
    const id   = product.id
    const asin = product.asin!
    try {
      const result = await checkColombiaAvailability(asin)
      const prev   = entries[id]
      const isUnavailableNow = result.status === 'unavailable'
      const cFail  = isUnavailableNow
        ? ((prev?.status === 'unavailable' ? (prev.consecutiveFails ?? 0) : 0) + 1)
        : 0

      entries[id] = {
        productId: id, asin,
        status: result.status, source: 'live-check',
        httpStatus: result.httpStatus, checkedAt: now,
        consecutiveFails: cFail,
        amazonGlobalEligible: result.amazonGlobalEligible,
        hasImportFees: result.hasImportFees,
        restrictionSignals: result.restrictionSignals,
        failureReason: result.failureReason,
      }

      switch (result.status) {
        case 'available':    available++;    break
        case 'unavailable':  unavailable++;  break
        case 'rate-limited': rateLimited++;  break
      }

      if (isUnavailableNow && cFail >= 2) {
        quarCandidates.push({ productId: id, asin, title: product.title, category: product.category, consecutiveFails: cFail })
      }

      updater.advance(isUnavailableNow ? 'suppressed' : 'processed', asin)
    } catch {
      updater.advance('failed', asin)
    }
  })

  if (!dryRun) {
    saveColombiaCache({ generatedAt: now, entries })

    const toQ = quarCandidates.filter(p => !isQuarantined(p.productId))
    if (toQ.length > 0) {
      const q = bulkQuarantine(toQ.map(p => ({
        productId: p.productId, asin: p.asin, title: p.title, category: p.category,
        reason: `No disponible para Colombia — ${p.consecutiveFails} auditorías consecutivas`,
        quarantinedBy: 'audit' as const,
      })))
      autoQuarantined = q.added
    }
  }

  updater.flush()

  return {
    summary:  `Colombia Audit: ${available} disponibles, ${unavailable} no disponibles, ${catalogFieldResolved} desde catálogo`,
    affected: liveSlice.length + catalogFieldResolved,
    warnings: unavailable > 0 ? [`${unavailable} productos no disponibles en Colombia`] : [],
    errors:   autoQuarantined > 0 ? [`${autoQuarantined} productos auto-quarantinados`] : [],
    data: { available, unavailable, rateLimited, catalogFieldResolved, autoQuarantined },
  }
}

async function runSelfHealing(job: ExecJob): Promise<ExecJobResult> {
  const opts     = job.options
  const startMs  = Date.now()
  const updater  = makeProgressUpdater(job.id, startMs)

  const result = await runHealingCycle({
    dryRun:   opts.dryRun === true,
    maxArchive:  typeof opts.maxArchive  === 'number' ? opts.maxArchive  : undefined,
    maxRecover:  typeof opts.maxRecover  === 'number' ? opts.maxRecover  : undefined,
    maxDriftRepairs: typeof opts.maxDriftRepairs === 'number' ? opts.maxDriftRepairs : undefined,
    minRecoveryScore: typeof opts.minRecoveryScore === 'number' ? opts.minRecoveryScore : undefined,
  })

  const total = result.archived.length + result.recovered.length + result.driftRepairs.length
  updater.setTotal(total)
  for (let i = 0; i < result.archived.length;  i++) updater.advance('suppressed')
  for (let i = 0; i < result.recovered.length; i++) updater.advance('recovered')
  for (let i = 0; i < result.driftRepairs.length; i++) updater.advance('repaired')
  updater.flush()

  return {
    summary:  `Self-Healing: ${result.archived.length} suprimidos, ${result.recovered.length} recuperados, ${result.driftRepairs.length} drift repairs`,
    affected: total,
    warnings: [],
    errors:   result.ok ? [] : ['Ciclo de healing completado con advertencias'],
    data: {
      archived:     result.archived.length,
      recovered:    result.recovered.length,
      driftRepairs: result.driftRepairs.length,
      replacements: result.replacements.length,
      dryRun:       result.dryRun,
    },
  }
}

async function runPaapiSync(job: ExecJob): Promise<ExecJobResult> {
  const opts    = job.options
  const updater = makeProgressUpdater(job.id, Date.now())
  updater.setTotal(1)

  const log = await syncImages({
    forceRefresh: opts.forceRefresh === true,
    dryRun:       opts.dryRun === true,
  })

  updater.advance('processed')
  updater.flush()

  return {
    summary:  `PA-API Sync: ${log.updated} actualizados, ${log.unchanged} sin cambios, ${log.errors} errores`,
    affected: log.updated,
    warnings: log.unchanged > 0 ? [`${log.unchanged} imágenes sin cambios (ya actualizadas)`] : [],
    errors:   log.errors > 0 ? [`${log.errors} errores durante sincronización`] : [],
    data: {
      updated:   log.updated,
      unchanged: log.unchanged,
      errors:    log.errors,
      fromCache: log.fromCache,
      noImage:   log.noImage,
    },
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Executes the given job and returns its result.
 * Callers must update job status before/after calling this function.
 */
export async function runJob(job: ExecJob): Promise<ExecJobResult> {
  // Mark running
  updateJob(job.id, { status: 'running', startedAt: new Date().toISOString() })

  try {
    let result: ExecJobResult

    switch (job.type) {
      case 'trust-recompute':    result = await runTrustRecompute(job);  break
      case 'repair':             result = await runRepair(job);          break
      case 'live-truth':         result = await runLiveTruth(job);       break
      case 'link-audit':         result = await runLinkAudit(job);       break
      case 'colombia-audit':     result = await runColombiaAudit(job);   break
      case 'self-healing':       result = await runSelfHealing(job);     break
      case 'paapi-sync':         result = await runPaapiSync(job);       break
      case 'recovery-pipeline':
        result = { summary: 'Recovery pipeline — use runRecoveryPipeline()', affected: 0, warnings: [], errors: ['Use pipeline-engine directly'] }
        break
      default: {
        const t = (job as ExecJob).type
        result = { summary: `Unknown job type: ${t}`, affected: 0, warnings: [], errors: [`Unknown type: ${t}`] }
      }
    }

    // Check if cancelled mid-run
    const finalStatus = job.status === 'cancelled' ? 'cancelled' : 'completed'
    updateJob(job.id, {
      status:      finalStatus,
      completedAt: new Date().toISOString(),
      result,
    })

    return result
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    updateJob(job.id, {
      status:      'failed',
      completedAt: new Date().toISOString(),
      error:       errorMsg.slice(0, 500),
    })
    throw err
  }
}
