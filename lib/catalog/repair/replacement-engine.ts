/**
 * lib/catalog/repair/replacement-engine.ts
 *
 * Core orchestrator for the autonomous catalog repair pipeline.
 *
 * For each broken product it:
 *   1. Diagnoses what's wrong (returns RepairReason[])
 *   2. Searches for candidates from available sources
 *   3. Scores and ranks the candidates
 *   4. Selects the best candidate (or null if none meet threshold)
 *   5. Builds patches if confidence >= threshold
 *   6. Records result to history
 *
 * Does NOT apply patches to disk — that is done by applyPatch() in auto-fix.ts.
 * The caller (index.ts / API route) decides whether to actually write files.
 */

import { getAllProducts } from '@/data/catalog'
import { isKnownBrokenImageUrl, isInvalidImageUrl } from '@/lib/catalog/placeholders'
import { isValidAsinFormat } from '@/lib/catalog/validator'
import type { Product } from '@/types'

import type {
  RepairReason,
  RepairJob,
  CatalogPatch,
  RepairOptions,
  PipelineResult,
  RepairCandidate,
} from './types'
import { searchCandidates } from './candidate-search'
import { scoreCandidates } from './candidate-scoring'
import { recordReplacement, recordFailure } from './history'

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIDENCE_THRESHOLD = 85

/**
 * Maps category slug → source file path (relative to cwd).
 * Used to locate the TypeScript file that needs patching.
 */
const CATEGORY_FILE_MAP: Record<string, string> = {
  electronica:  'data/catalog/electronica.ts',
  gaming:       'data/catalog/gaming.ts',
  hogar:        'data/catalog/hogar.ts',
  cocina:       'data/catalog/cocina.ts',
  deporte:      'data/catalog/deporte.ts',
  oficina:      'data/catalog/oficina.ts',
  belleza:      'data/catalog/belleza.ts',
  mascotas:     'data/catalog/mascotas.ts',
  bebes:        'data/catalog/bebes.ts',
  herramientas: 'data/catalog/herramientas.ts',
}

// ── Diagnosis ──────────────────────────────────────────────────────────────────

/**
 * Returns the list of repair reasons for a product.
 * A product can have multiple simultaneous issues.
 */
export function diagnoseProduct(product: Product): RepairReason[] {
  const reasons: RepairReason[] = []

  // Missing or structurally invalid image URL
  if (!product.image || isInvalidImageUrl(product.image)) {
    reasons.push('invalid_image_url')
  } else if (product.image.includes('images-na.ssl-images-amazon.com/images/P/')) {
    // P/ format — needs PA-API to derive the new image hash
    reasons.push('missing_image_hash')
  } else if (isKnownBrokenImageUrl(product.image)) {
    reasons.push('broken_image_cdn')
  }

  // ASIN format
  if (!product.asin) {
    reasons.push('invalid_asin_format')
  } else if (!isValidAsinFormat(product.asin)) {
    reasons.push('invalid_asin_format')
  }

  // Status-based reasons
  if (product.status === 'inactive') {
    reasons.push('inactive_asin')
  }

  // Colombia restriction
  if (product.colombiaRestriction) {
    reasons.push('colombia_restricted')
  }

  return reasons
}

/**
 * Returns all products that currently need repair.
 * Filters to only products failing public gates OR with known issues.
 */
export function findProductsNeedingRepair(
  options: RepairOptions = {},
): Product[] {
  const all = getAllProducts()

  return all.filter(product => {
    // Category filter
    if (options.categories && !options.categories.includes(product.category)) {
      return false
    }

    const reasons = diagnoseProduct(product)
    if (reasons.length === 0) return false

    // Reason filter
    if (options.reasons) {
      return reasons.some(r => options.reasons!.includes(r))
    }

    return true
  })
}

// ── Patch building ─────────────────────────────────────────────────────────────

/**
 * Builds the catalog patches for an approved candidate.
 * Only builds image patches for CDN swap (safe to auto-apply).
 * ASIN patches are never built automatically.
 */
export function buildPatchesForCandidate(
  product: Product,
  candidate: RepairCandidate,
): CatalogPatch[] {
  const patches: CatalogPatch[] = []
  const filePath = CATEGORY_FILE_MAP[product.category]

  if (!filePath) return patches // unknown category — can't patch

  // Image patch (CDN swap only — safe to auto-apply)
  if (
    candidate.source === 'cdn_swap' &&
    candidate.imageUrl &&
    candidate.imageVerified === true &&
    product.image &&
    candidate.imageUrl !== product.image
  ) {
    patches.push({
      filePath,
      productId: product.id ?? '',
      field: 'image',
      oldValue: product.image,
      newValue: candidate.imageUrl,
    })
  }

  return patches
}

// ── Single product repair job ──────────────────────────────────────────────────

/**
 * Runs the repair pipeline for a single product.
 * Returns a RepairJob with full diagnosis, candidates, selection, and patches.
 */
export async function repairProduct(
  product: Product,
  options: RepairOptions = {},
): Promise<RepairJob> {
  const threshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD
  const now = new Date().toISOString()

  const job: RepairJob = {
    productId: product.id ?? 'unknown',
    asin: product.asin ?? '',
    title: product.title,
    category: product.category,
    reasons: diagnoseProduct(product),
    candidates: [],
    selectedCandidate: null,
    patches: [],
    status: 'no_candidate_found',
    confidence: 0,
    createdAt: now,
  }

  // ── Early exits ─────────────────────────────────────────────────────────────

  // Only PA-API can fix P/ paths
  if (job.reasons.includes('missing_image_hash') && !job.reasons.includes('broken_image_cdn')) {
    job.status = 'needs_paapi'
    recordFailure({
      productId: job.productId,
      asin: job.asin,
      reasons: job.reasons,
      attemptedAt: now,
      error: 'Images /P/ format requires PA-API to repair.',
    })
    return job
  }

  if (options.dryRun) {
    job.status = 'skipped'
    return job
  }

  // ── Candidate search ─────────────────────────────────────────────────────────
  try {
    const rawCandidates = await searchCandidates(product)

    // Score all candidates (includes image verification via HEAD requests)
    const scored = await scoreCandidates(rawCandidates, product, { verify: true })
    job.candidates = scored

    // ── Select best ───────────────────────────────────────────────────────────
    const best = scored[0] ?? null

    if (!best || best.confidence === 0) {
      job.status = 'no_candidate_found'
      recordFailure({
        productId: job.productId,
        asin: job.asin,
        reasons: job.reasons,
        attemptedAt: now,
        error: 'No viable candidate found.',
      })
      return job
    }

    job.selectedCandidate = best
    job.confidence = best.confidence

    if (best.confidence >= threshold) {
      // Auto-replace: build patches (will be applied by the caller)
      job.patches = buildPatchesForCandidate(product, best)

      if (job.patches.length > 0) {
        job.status = 'auto_replaced'
        // Record to history (patches applied = true only after disk write)
        recordReplacement({
          productId: job.productId,
          previousAsin: job.asin,
          previousImage: product.image,
          replacementImage: best.imageUrl,
          reason: job.reasons[0] ?? 'broken_image_cdn',
          confidence: best.confidence,
          status: 'auto_replaced',
          timestamp: now,
          note: best.notes,
        })
      } else {
        // High confidence but no patchable fields (e.g. ML ASIN — needs manual)
        job.status = 'manual_review_required'
        recordReplacement({
          productId: job.productId,
          previousAsin: job.asin,
          previousImage: product.image,
          replacementImage: best.imageUrl,
          reason: job.reasons[0] ?? 'broken_image_cdn',
          confidence: best.confidence,
          status: 'manual_review_required',
          timestamp: now,
          note: best.notes ?? 'No patchable fields — manual review required',
        })
      }
    } else {
      // Below threshold — flag for manual review
      job.status = 'manual_review_required'
      recordReplacement({
        productId: job.productId,
        previousAsin: job.asin,
        previousImage: product.image,
        replacementImage: best.imageUrl,
        reason: job.reasons[0] ?? 'broken_image_cdn',
        confidence: best.confidence,
        status: 'manual_review_required',
        timestamp: now,
        note: `Confidence ${best.confidence}/100 < threshold ${threshold}`,
      })
    }
  } catch (err) {
    job.status = 'no_candidate_found'
    job.error = String(err)
    recordFailure({
      productId: job.productId,
      asin: job.asin,
      reasons: job.reasons,
      attemptedAt: now,
      error: job.error,
    })
  }

  return job
}

// ── Full pipeline run ──────────────────────────────────────────────────────────

/**
 * Runs the repair pipeline across the full catalog (or a filtered subset).
 * Applies patches to disk unless dryRun is true.
 *
 * Returns a PipelineResult with per-job details and summary counts.
 */
export async function runRepairPipeline(
  options: RepairOptions = {},
): Promise<PipelineResult> {
  const startMs = Date.now()
  const runAt = new Date().toISOString()
  const dryRun = options.dryRun ?? false
  const limit = options.limit ?? 20 // default: process up to 20 products per run

  // Find products needing repair
  const toRepair = findProductsNeedingRepair(options).slice(0, limit)

  // Run repair jobs (sequentially to avoid overloading external APIs)
  const jobs: RepairJob[] = []
  for (const product of toRepair) {
    const job = await repairProduct(product, options)
    jobs.push(job)

    // If auto_replaced, apply patches to disk (unless dryRun)
    if (!dryRun && job.status === 'auto_replaced' && job.patches.length > 0) {
      const { applyPatches } = await import('./auto-fix')
      const { errors } = applyPatches(job.patches, false, true)
      if (errors.length > 0) {
        job.error = errors.join('; ')
        job.status = 'manual_review_required'
      }
    }
  }

  // Summarise
  const autoRepaired    = jobs.filter(j => j.status === 'auto_replaced').length
  const manualReview    = jobs.filter(j => j.status === 'manual_review_required').length
  const noCandidate     = jobs.filter(j => j.status === 'no_candidate_found').length
  const needsPaapi      = jobs.filter(j => j.status === 'needs_paapi').length

  return {
    runAt,
    dryRun,
    processed: jobs.length,
    autoRepaired,
    manualReview,
    noCandidate,
    needsPaapi,
    jobs,
    durationMs: Date.now() - startMs,
  }
}
