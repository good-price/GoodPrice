/**
 * lib/catalog/repair/auto-fix.ts
 *
 * Applies approved patches to TypeScript catalog source files.
 *
 * Supported patch fields:
 *   'image'   — replaces image URL string literal in the product entry
 *   'asin'    — replaces ASIN string literal (NOT auto-applied; requires manual review)
 *   'status'  — replaces status value (e.g. 'active' → 'inactive')
 *
 * Strategy:
 *   Source files contain product entries as object literals. We locate the product
 *   by its `id` field and then swap the target field value using regex replacement.
 *   This is a targeted string substitution — not a full TypeScript AST transform.
 *
 * Safety rules:
 *   1. We NEVER patch if the pattern matches more than one location in the file
 *      (ambiguous match → fail with error).
 *   2. We always verify the replacement produces a different file content.
 *   3. ASIN patches are BLOCKED — asin replacement requires PA-API verification
 *      and must be done manually.
 *   4. Dry-run mode returns patches without writing any files.
 *
 * File format assumption:
 *   Each product is an object with an `id` field like:
 *     {
 *       id: 'some-id',
 *       ...
 *       image: 'https://old-url',
 *       ...
 *     }
 *   The field value must be a single-quoted or double-quoted string on one line.
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import type { CatalogPatch } from './types'

// ── Constants ──────────────────────────────────────────────────────────────────

/** Fields that are safe to auto-patch. ASIN is intentionally excluded. */
const AUTO_PATCHABLE_FIELDS = new Set<string>(['image', 'status'])

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Escapes a string for use in a RegExp literal.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Builds a regex that matches the field assignment near the product id.
 *
 * We use a two-phase approach:
 *   Phase 1 — find the product block by its id
 *   Phase 2 — within a reasonable distance, find the field assignment
 *
 * The regex captures the full line so we can do a precise replacement.
 */
function buildFieldPattern(
  productId: string,
  field: string,
  oldValue: string,
): RegExp {
  const escapedId    = escapeRegex(productId)
  const escapedField = escapeRegex(field)
  const escapedValue = escapeRegex(oldValue)

  // Match the field assignment line with the expected old value
  // Allows single or double quotes around the value
  // Anchored to the line using ^ and $ (multiline flag)
  return new RegExp(
    `(id:\\s*['"]${escapedId}['"][\\s\\S]{0,2000}?` +
    `)(\\s*${escapedField}:\\s*)(['"])(${escapedValue})(['"])`,
    '',
  )
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface ApplyPatchResult {
  success: boolean
  /** Number of files written (0 in dry run) */
  filesWritten: number
  error?: string
}

/**
 * Applies a single catalog patch to its target file.
 *
 * @param patch   The patch to apply (from replacement-engine.ts)
 * @param dryRun  If true, validates but does NOT write files
 */
export function applyPatch(
  patch: CatalogPatch,
  dryRun = false,
): ApplyPatchResult {
  // ── Safety: block ASIN auto-patches ──────────────────────────────────────
  if (patch.field === 'asin') {
    return {
      success: false,
      filesWritten: 0,
      error: 'ASIN patches are blocked — must be applied manually after PA-API verification.',
    }
  }

  if (!AUTO_PATCHABLE_FIELDS.has(patch.field)) {
    return {
      success: false,
      filesWritten: 0,
      error: `Field '${patch.field}' is not auto-patchable.`,
    }
  }

  // ── Read source file ──────────────────────────────────────────────────────
  const absPath = resolve(process.cwd(), patch.filePath)
  let source: string
  try {
    source = readFileSync(absPath, 'utf8')
  } catch (err) {
    return {
      success: false,
      filesWritten: 0,
      error: `Cannot read ${patch.filePath}: ${String(err)}`,
    }
  }

  // ── Verify old value is present ───────────────────────────────────────────
  if (!source.includes(patch.oldValue)) {
    return {
      success: false,
      filesWritten: 0,
      error: `Old value not found in ${patch.filePath} for product ${patch.productId}.`,
    }
  }

  // ── Build pattern and count matches ──────────────────────────────────────
  const pattern = buildFieldPattern(patch.productId, patch.field, patch.oldValue)
  const matches = Array.from(source.matchAll(new RegExp(pattern.source, 'gs')))

  if (matches.length === 0) {
    // Fallback: simple line-level replacement (less precise but handles edge cases)
    return applySimplePatch(patch, source, absPath, dryRun)
  }

  if (matches.length > 1) {
    return {
      success: false,
      filesWritten: 0,
      error: `Ambiguous match: found ${matches.length} locations for ${patch.field} in ${patch.filePath}. Manual fix required.`,
    }
  }

  // ── Apply replacement ─────────────────────────────────────────────────────
  const match = matches[0]
  // Determine quote style from the captured group
  const quote = match[3] ?? "'"
  const patched = source.replace(
    new RegExp(pattern.source, 'gs'),
    `$1$2${quote}${patch.newValue}${quote}`,
  )

  if (patched === source) {
    return {
      success: false,
      filesWritten: 0,
      error: `Replacement produced no change in ${patch.filePath}. Old and new values may be identical.`,
    }
  }

  if (dryRun) {
    return { success: true, filesWritten: 0 }
  }

  try {
    writeFileSync(absPath, patched, 'utf8')
    return { success: true, filesWritten: 1 }
  } catch (err) {
    return {
      success: false,
      filesWritten: 0,
      error: `Failed to write ${patch.filePath}: ${String(err)}`,
    }
  }
}

/**
 * Simple fallback: finds the first occurrence of the old value on a line that
 * also contains the field name, and replaces it.
 * Used when the regex-with-id-anchor fails (e.g. multiline product objects with
 * embedded objects that confuse the look-behind distance).
 */
function applySimplePatch(
  patch: CatalogPatch,
  source: string,
  absPath: string,
  dryRun: boolean,
): ApplyPatchResult {
  const lines = source.split('\n')
  const fieldPattern = new RegExp(
    `^(\\s*${escapeRegex(patch.field)}:\\s*)(['"])${escapeRegex(patch.oldValue)}\\2`,
  )

  let patchedCount = 0
  const patchedLines = lines.map(line => {
    if (fieldPattern.test(line)) {
      patchedCount++
      return line.replace(
        new RegExp(`(['"])${escapeRegex(patch.oldValue)}\\1`),
        `$1${patch.newValue}$1`,
      )
    }
    return line
  })

  if (patchedCount === 0) {
    return {
      success: false,
      filesWritten: 0,
      error: `Simple patch fallback: field '${patch.field}' with value '${patch.oldValue}' not found in ${patch.filePath}.`,
    }
  }
  if (patchedCount > 1) {
    return {
      success: false,
      filesWritten: 0,
      error: `Simple patch fallback: ambiguous — ${patchedCount} lines match field '${patch.field}' in ${patch.filePath}.`,
    }
  }

  if (dryRun) return { success: true, filesWritten: 0 }

  try {
    writeFileSync(absPath, patchedLines.join('\n'), 'utf8')
    return { success: true, filesWritten: 1 }
  } catch (err) {
    return {
      success: false,
      filesWritten: 0,
      error: `Failed to write ${patch.filePath}: ${String(err)}`,
    }
  }
}

/**
 * Applies multiple patches in sequence.
 * Stops on first failure unless `continueOnError` is true.
 */
export function applyPatches(
  patches: CatalogPatch[],
  dryRun = false,
  continueOnError = false,
): { results: ApplyPatchResult[]; totalWritten: number; errors: string[] } {
  const results: ApplyPatchResult[] = []
  const errors: string[] = []
  let totalWritten = 0

  for (const patch of patches) {
    const result = applyPatch(patch, dryRun)
    results.push(result)
    if (result.success) {
      totalWritten += result.filesWritten
    } else {
      if (result.error) errors.push(result.error)
      if (!continueOnError) break
    }
  }

  return { results, totalWritten, errors }
}
