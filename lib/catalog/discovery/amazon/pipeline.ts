/**
 * lib/catalog/discovery/amazon/pipeline.ts
 *
 * Amazon Discovery Pipeline — Sprint 4A / 4B / 4C.
 *
 * runAmazonDiscovery(category):
 *   1.  Get sources for category
 *   2.  Scrape all sources in parallel
 *   3.  Parse HTML from each successful scrape
 *   4.  Enrich parsed products (brand, title cleaning, image normalization)
 *   5.  Validate and deduplicate candidates
 *   6.  Build DiscoveryCandidates with intelligence tracking (Sprint 4C)
 *   7.  Merge into candidate store (preserves intelligence fields)
 *   8.  Update rejected candidates' timesRejected count (Sprint 4C)
 *   9.  Append OPS log with quality/confidence/conversion metrics (Sprint 4C)
 *   10. Persist per-category discovery state (Sprint 4B)
 *   11. Persist cumulative discovery metrics (Sprint 4C)
 *   12. Return AmazonDiscoveryResult
 *
 * Guarantees:
 *   - Never modifies the runtime catalog directly
 *   - Never throws (all errors caught and logged)
 *   - Partial success: returns whatever was collected if some sources failed
 *
 * SERVER-ONLY.
 */

import { appendLog }                     from '@/lib/ops/logs'
import type { OpsLog }                   from '@/lib/ops/logs'
import {
  mergeDiscoveryCandidates,
  updateRejectedCandidates,
  loadCandidates,
}                                         from '@/lib/catalog/discovery/candidate-store'
import type { DiscoveryCandidate }        from '@/lib/catalog/discovery/types'
import { enrichCandidates }              from '@/lib/catalog/discovery/enrichment'
import { updateDiscoveryCategoryState }  from '@/lib/catalog/discovery/state'
import { updateDiscoveryMetrics }        from '@/lib/catalog/discovery/metrics'
import { computeQualityScore, computeConfidenceScore } from '@/lib/catalog/discovery/intelligence'

import { getCategoryDiscoverySources } from './sources'
import { fetchDiscoverySource }        from './scraper'
import { parseDiscoveryHtml }          from './parser'
import { validateDiscoveryCandidates } from './validator'
import type { AmazonDiscoveryResult, ParsedProduct, ScrapeResult } from './types'

// ── Converter: ParsedProduct → DiscoveryCandidate (base, no intelligence) ─────

function toDiscoveryCandidate(
  p: ParsedProduct,
  category: string,
  rank: number,
): DiscoveryCandidate {
  return {
    asin:         p.asin,
    rank,
    category,
    tileTitle:    p.title || null,
    imageUrl:     p.image,
    rating:       p.rating || null,
    reviewCount:  p.reviews || null,
    tilePrice:    p.price  || null,
    discoveredAt: p.discoveredAt,
    source:       'best-sellers',  // backward-compat with existing store shape
    brand:        p.brand ?? null, // Sprint 4B: populated from enrichment
  }
}

// ── Intelligence builder ──────────────────────────────────────────────────────

function buildWithIntelligence(
  p: ParsedProduct,
  category: string,
  rank: number,
  existing: DiscoveryCandidate | undefined,
  pipelineId: string,
): DiscoveryCandidate {
  const timesDiscovered = (existing?.timesDiscovered ?? 0) + 1
  const timesValidated  = (existing?.timesValidated  ?? 0) + 1

  const base: DiscoveryCandidate = {
    ...toDiscoveryCandidate(p, category, rank),
    firstDiscoveredAt:       existing?.firstDiscoveredAt ?? existing?.discoveredAt ?? p.discoveredAt,
    lastDiscoveredAt:        p.discoveredAt,
    timesDiscovered,
    timesValidated,
    timesRejected:           existing?.timesRejected ?? 0,
    timesAdmitted:           existing?.timesAdmitted ?? 0,
    lastDiscoveryPipelineId: pipelineId,
  }

  return {
    ...base,
    qualityScore:    computeQualityScore(base),
    confidenceScore: computeConfidenceScore(base),
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs the full Amazon Discovery pipeline for one category.
 *
 * All sources are scraped concurrently (Promise.allSettled).
 * Writes one catalog-discovery OPS log with quality/confidence metrics.
 * Persists per-category discovery state and cumulative metrics.
 * Never throws.
 */
export async function runAmazonDiscovery(category: string): Promise<AmazonDiscoveryResult> {
  const t0         = Date.now()
  const pipelineId = `cd-${category}-${t0}`
  const errors:   string[] = []
  const warnings: string[] = []

  try {
    // ── 1. Sources ─────────────────────────────────────────────────────────────
    const sources = getCategoryDiscoverySources(category)
    if (sources.length === 0) {
      const result: AmazonDiscoveryResult = {
        category, sources: 0, scraped: 0, parsed: 0, validated: 0, saved: 0,
        errors:   [`No discovery sources configured for category: ${category}`],
        durationMs: Date.now() - t0,
      }
      appendDiscoveryLog(result, [], [], category, t0, [], 0, 0, 0)
      persistState(category, 'failed', result, warnings, errors)
      return result
    }

    // ── 2. Scrape all sources in parallel ──────────────────────────────────────
    const scrapeResults: ScrapeResult[] = await Promise.allSettled(
      sources.map(s => fetchDiscoverySource(s)),
    ).then(settled =>
      settled.map((r, i) => {
        if (r.status === 'fulfilled') return r.value
        return {
          success:    false,
          html:       '',
          status:     0,
          durationMs: 0,
          source:     sources[i]!,
          error:      r.reason instanceof Error ? r.reason.message : String(r.reason),
        } satisfies ScrapeResult
      }),
    )

    const scraped = scrapeResults.filter(r => r.success).length

    for (const r of scrapeResults) {
      if (!r.success) {
        warnings.push(`${r.source.type} (${r.source.url}) — ${r.error ?? 'failed'}`)
      }
    }

    // ── 3. Parse ───────────────────────────────────────────────────────────────
    const allParsed: ParsedProduct[] = []
    const seenAsins = new Set<string>()

    for (const sr of scrapeResults) {
      if (!sr.success) continue
      const parsed = parseDiscoveryHtml(sr)
      for (const p of parsed) {
        if (!seenAsins.has(p.asin)) {
          seenAsins.add(p.asin)
          allParsed.push(p)
        }
      }
    }

    if (allParsed.length === 0 && scraped === 0) {
      warnings.push('All sources blocked or failed — no HTML to parse')
    }

    // ── 4. Enrich ──────────────────────────────────────────────────────────────
    const pool        = loadCandidates()
    const allEnriched = enrichCandidates(allParsed, pool)

    // ── 5. Validate ────────────────────────────────────────────────────────────
    const validation = validateDiscoveryCandidates(allEnriched)
    if (validation.errors.length > 0) {
      errors.push(...validation.errors)
    }

    // ── 6. Build candidates with intelligence tracking (Sprint 4C) ─────────────
    const existingByAsin = new Map(pool.items.map(c => [c.asin, c]))

    const candidates: DiscoveryCandidate[] = validation.candidates.map((p, i) =>
      buildWithIntelligence(p, category, i + 1, existingByAsin.get(p.asin), pipelineId),
    )

    // Compute quality/confidence averages for OPS log and governance warnings
    const qualityAvg    = candidates.length > 0
      ? candidates.reduce((s, c) => s + (c.qualityScore    ?? 0), 0) / candidates.length
      : 0
    const confidenceAvg = candidates.length > 0
      ? candidates.reduce((s, c) => s + (c.confidenceScore ?? 0), 0) / candidates.length
      : 0

    // ── 7. Merge into candidate store ──────────────────────────────────────────
    const { added, updated } = mergeDiscoveryCandidates(candidates)
    const saved = added + updated

    // ── 8. Update rejected candidates' timesRejected ──────────────────────────
    updateRejectedCandidates(validation.rejectedAsins)

    // ── 9. Governance warnings ─────────────────────────────────────────────────
    // Check pool count after merge
    const poolAfter    = loadCandidates()
    const categoryCount = poolAfter.items.filter(c => c.category === category).length

    if (categoryCount < 5) {
      warnings.push(`Candidatos críticos: solo ${categoryCount} candidatos en ${category}`)
    }
    if (qualityAvg > 0 && qualityAvg < 40) {
      warnings.push(`Pool degradado: calidad promedio ${Math.round(qualityAvg)} en ${category}`)
    }
    if (confidenceAvg > 0 && confidenceAvg < 30) {
      warnings.push(`Confianza baja: promedio ${Math.round(confidenceAvg)} en ${category}`)
    }

    // ── 10. OPS log ────────────────────────────────────────────────────────────
    const result: AmazonDiscoveryResult = {
      category,
      sources:   sources.length,
      scraped,
      parsed:    allParsed.length,
      validated: validation.candidates.length,
      saved,
      errors,
      durationMs: Date.now() - t0,
    }

    const conversionRate = validation.candidates.length > 0
      ? saved / validation.candidates.length
      : 0

    appendDiscoveryLog(
      result,
      validation.candidates.map(p => p.asin),
      validation.rejectedAsins,
      category,
      t0,
      warnings,
      qualityAvg,
      confidenceAvg,
      conversionRate,
    )

    // ── 11. Persist state + metrics ────────────────────────────────────────────
    const discoveryStatus: 'success' | 'partial' | 'failed' =
      saved > 0 && errors.length === 0 ? 'success' :
      saved > 0                        ? 'partial'  :
                                         'failed'

    persistState(category, discoveryStatus, result, warnings, errors)
    updateDiscoveryMetrics(category, {
      status:    discoveryStatus,
      durationMs: result.durationMs,
      parsed:    result.parsed,
      validated: result.validated,
      saved:     result.saved,
      rejected:  validation.rejected,
    })

    return result

  } catch (err) {
    const msg    = err instanceof Error ? err.message : String(err)
    const result: AmazonDiscoveryResult = {
      category, sources: 0, scraped: 0, parsed: 0, validated: 0, saved: 0,
      errors:     [...errors, msg],
      durationMs: Date.now() - t0,
    }
    appendDiscoveryLog(result, [], [], category, t0, warnings, 0, 0, 0)
    persistState(category, 'failed', result, warnings, result.errors)
    return result
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function persistState(
  category: string,
  status: 'success' | 'partial' | 'failed',
  result: AmazonDiscoveryResult,
  warnings: string[],
  errors: string[],
): void {
  updateDiscoveryCategoryState(category, {
    status,
    durationMs: result.durationMs,
    parsed:     result.parsed,
    validated:  result.validated,
    saved:      result.saved,
    warnings,
    errors,
  })
}

function appendDiscoveryLog(
  result: AmazonDiscoveryResult,
  newAsins: string[],
  rejectedAsins: string[],
  category: string,
  t0: number,
  warnings: string[] = [],
  qualityAvg    = 0,
  confidenceAvg = 0,
  conversionRate = 0,
): void {
  try {
    const completedAt = new Date().toISOString()
    const startedAt   = new Date(t0).toISOString()

    const logStatus =
      result.saved > 0 && result.errors.length === 0 ? 'success' :
      result.saved > 0                                ? 'partial' :
      result.errors.length > 0                        ? 'failed'  :
                                                        'partial'

    const log: OpsLog = {
      id:          `cd-${category}-${Date.now()}`,
      jobType:     'catalog-discovery',
      trigger:     'manual',
      startedAt,
      completedAt,
      durationMs:  result.durationMs,
      status:      logStatus,
      summary:     `Amazon Discovery completado — ${category}: ${result.saved} candidatos guardados.`,
      notes: [
        `category: ${category}`,
        `sources: ${result.sources}`,
        `scraped: ${result.scraped}`,
        `parsed: ${result.parsed}`,
        `validated: ${result.validated}`,
        `saved: ${result.saved}`,
        `duration: ${result.durationMs}ms`,
        // Sprint 4C: intelligence metrics
        `qualityAverage: ${Math.round(qualityAvg)}`,
        `confidenceAverage: ${Math.round(confidenceAvg)}`,
        `conversionRate: ${(conversionRate * 100).toFixed(1)}%`,
      ].join(', '),
      actions: {
        removed:    [],
        repaired:   [],
        suppressed: [],
        recovered:  newAsins.slice(0, 20),       // first 20 new/updated ASINs
        flagged:    rejectedAsins.slice(0, 20),  // Sprint 4B: quality-rejected ASINs
      },
      errors:   result.errors,
      warnings,
    }
    appendLog(log)
  } catch {
    // OPS log failure must never affect the pipeline result
  }
}
