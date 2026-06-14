/**
 * lib/catalog/drafts.ts
 *
 * File-backed store for ProductDraft records — products that passed the
 * Candidate Validator and are waiting for human review before being
 * promoted to the active catalog.
 *
 * Storage: data/catalog/drafts.json  (writable at runtime via dataPath)
 * SERVER-ONLY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { dirname } from 'path'
import { dataPath } from '@/lib/data-path'
import type { ProductDraft, DraftStore } from './candidate/types'

const STORE_PATH = dataPath('data', 'catalog', 'drafts.json')

function readStore(): DraftStore {
  if (!existsSync(STORE_PATH)) return { updatedAt: '', drafts: [] }
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as DraftStore
  } catch {
    return { updatedAt: '', drafts: [] }
  }
}

function writeStore(store: DraftStore): void {
  const dir = dirname(STORE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = STORE_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, STORE_PATH)
}

export function getDrafts(statusFilter?: ProductDraft['status']): ProductDraft[] {
  const store = readStore()
  if (!statusFilter) return store.drafts
  return store.drafts.filter(d => d.status === statusFilter)
}

export function getDraftById(draftId: string): ProductDraft | null {
  return readStore().drafts.find(d => d.draftId === draftId) ?? null
}

export function saveDraft(draft: ProductDraft): ProductDraft {
  const store = readStore()
  store.drafts = store.drafts.filter(d => d.draftId !== draft.draftId)
  store.drafts.push(draft)
  store.updatedAt = new Date().toISOString()
  writeStore(store)
  return draft
}

export function updateDraftStatus(
  draftId: string,
  status: ProductDraft['status'],
): ProductDraft | null {
  const store = readStore()
  const idx   = store.drafts.findIndex(d => d.draftId === draftId)
  if (idx < 0) return null
  const now = new Date().toISOString()
  store.drafts[idx] = {
    ...store.drafts[idx],
    status,
    ...(status === 'promoted' ? { promotedAt: now } : {}),
    ...(status === 'dismissed' ? { dismissedAt: now } : {}),
  }
  store.updatedAt = now
  writeStore(store)
  return store.drafts[idx]
}
