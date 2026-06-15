/**
 * lib/catalog/discovery/candidate-store.ts
 *
 * Reads and writes discovery-candidates.json.
 * On Vercel the file lives in /tmp (ephemeral); locally it lives in
 * data/catalog/discovery-candidates.json (committed as an empty seed).
 */

import fs   from 'fs'
import path from 'path'
import { dataPath } from '@/lib/data-path'
import type { CandidateStore, DiscoveryCandidate } from './types'

function storePath(): string {
  return dataPath('data', 'catalog', 'discovery-candidates.json')
}

export function loadCandidates(): CandidateStore {
  const p = storePath()
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as CandidateStore
  } catch {
    return { updatedAt: new Date().toISOString(), items: [] }
  }
}

export function saveCandidates(candidates: DiscoveryCandidate[]): void {
  const store: CandidateStore = {
    updatedAt: new Date().toISOString(),
    items:     candidates,
  }
  const p = storePath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(store, null, 2), 'utf-8')
}
