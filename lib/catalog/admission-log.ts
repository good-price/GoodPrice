/**
 * lib/catalog/admission-log.ts
 *
 * Append-only log of every ASIN that went through the Candidate Validator
 * (both the /validate and /admit endpoints). Provides complete history of
 * admission decisions and rejection reasons.
 *
 * Storage: data/catalog/admission-log.json  (writable at runtime via dataPath)
 * SERVER-ONLY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { dirname } from 'path'
import { dataPath } from '@/lib/data-path'
import type { AdmissionLogEntry, AdmissionLog } from './candidate/types'

const STORE_PATH = dataPath('data', 'catalog', 'admission-log.json')
const MAX_ENTRIES = 10_000  // cap log size to avoid unbounded growth

function readLog(): AdmissionLog {
  if (!existsSync(STORE_PATH)) return { updatedAt: '', entries: [] }
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as AdmissionLog
  } catch {
    return { updatedAt: '', entries: [] }
  }
}

function writeLog(log: AdmissionLog): void {
  const dir = dirname(STORE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = STORE_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(log, null, 2), 'utf8')
  renameSync(tmp, STORE_PATH)
}

export function appendAdmissionLog(entry: AdmissionLogEntry): void {
  const log = readLog()
  log.entries.push(entry)
  // Trim oldest entries if over the cap
  if (log.entries.length > MAX_ENTRIES) {
    log.entries = log.entries.slice(-MAX_ENTRIES)
  }
  log.updatedAt = entry.checkedAt
  writeLog(log)
}

export function getAdmissionLog(): AdmissionLogEntry[] {
  return readLog().entries
}

/** Returns the last N entries, newest first. */
export function getRecentAdmissions(limit = 50): AdmissionLogEntry[] {
  return readLog().entries.slice(-limit).reverse()
}
