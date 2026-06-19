'use server'

/**
 * lib/catalog/runtime/config-actions.ts
 *
 * Server Actions for the Catalog Center Category Configuration.
 *
 * Handles:
 *   - Batch update of category minimums from the CategoryTable form
 *   - No-op detection (no write if nothing changed)
 *   - Atomic persist via saveCategoryConfig()
 *   - OPS log entry (manual-action) on every real change
 *
 * SERVER-ONLY. Never import in Client Components.
 */

import { redirect }   from 'next/navigation'
import { appendLog }  from '@/lib/ops/logs'
import type { OpsLog } from '@/lib/ops/logs'
import { getCategoryConfig, saveCategoryConfig, computeCategoryDeficits } from './category-config'
import { VALID_CATEGORIES } from './validation'
import { triggerAutoFill }  from './auto-fill'

// ── Save action ───────────────────────────────────────────────────────────────

/**
 * Reads all category minimum inputs from the form, detects changes against the
 * current config, persists atomically, and writes an OPS manual-action log.
 *
 * No-op: if no values changed, skips the write and logs nothing.
 * On error: swallows and redirects with status=error.
 * redirect() is always called outside try/catch.
 */
export async function saveCategoryConfigAction(formData: FormData): Promise<void> {
  let status: 'saved' | 'unchanged' | 'error' = 'unchanged'

  try {
    const current = getCategoryConfig()
    const changes: { category: string; from: number; to: number }[] = []

    for (const slug of Array.from(VALID_CATEGORIES)) {
      const raw = formData.get(slug)
      if (raw === null) continue

      const newMin = parseInt(String(raw), 10)
      if (isNaN(newMin) || newMin < 0 || newMin > 1000) continue

      const oldMin = current[slug]?.minimum ?? 20
      if (newMin !== oldMin) {
        changes.push({ category: slug, from: oldMin, to: newMin })
      }
    }

    if (changes.length > 0) {
      // Build and persist the new config atomically
      const newConfig = { ...current }
      for (const { category, to } of changes) {
        newConfig[category] = { minimum: to }
      }
      saveCategoryConfig(newConfig)

      // OPS log
      const now   = new Date().toISOString()
      const notes = changes
        .map(c => `${c.category}: ${c.from} → ${c.to}`)
        .join(', ')

      const log: OpsLog = {
        id:          `manual-${Date.now()}`,
        jobType:     'manual-action',
        trigger:     'manual',
        startedAt:   now,
        completedAt: now,
        durationMs:  0,
        status:      'success',
        summary:     'Configuración de mínimos actualizada.',
        notes,
        actions:     { removed: [], repaired: [], suppressed: [], recovered: [], flagged: [] },
        errors:      [],
        warnings:    [],
      }
      appendLog(log)

      status = 'saved'

      // Auto-trigger fill if any category is now below minimum.
      // Fire-and-forget: never block the redirect, never throw.
      try {
        const deficits = computeCategoryDeficits()
        if (deficits.some(d => d.deficit > 0)) {
          void triggerAutoFill()
        }
      } catch {
        // Intentionally swallowed — auto-fill failure must not affect config save
      }
    }
  } catch {
    status = 'error'
  }

  // redirect() throws internally — must be outside try/catch
  redirect(`/admin/catalog?status=${status}`)
}
