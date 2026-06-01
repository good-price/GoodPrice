/**
 * lib/tpe/discovery/discovery-log.ts
 *
 * Sprint 5A — Discovery Lite
 *
 * CRUD layer for data/tpe/discovery-log.json (DiscoveryLogStore).
 *
 * The log is append-only: once a DiscoveryJob is written it is never mutated.
 * This gives a permanent audit trail of every discovery run.
 */

import fs   from 'fs'
import path from 'path'
import type { DiscoveryLogStore, DiscoveryJob } from '@/types'

// ── Store path ────────────────────────────────────────────────────────────────

const LOG_PATH = path.resolve(process.cwd(), 'data/tpe/discovery-log.json')

// ── Read / write ──────────────────────────────────────────────────────────────

/** Load the DiscoveryLogStore from disk. Returns an empty store on any error. */
export function getDiscoveryLog(): DiscoveryLogStore {
  try {
    const raw = fs.readFileSync(LOG_PATH, 'utf-8')
    return JSON.parse(raw) as DiscoveryLogStore
  } catch {
    return emptyLog()
  }
}

/** Persist the full log store, stamping `updatedAt`. */
export function saveDiscoveryLog(store: DiscoveryLogStore): void {
  const updated: DiscoveryLogStore = { ...store, updatedAt: new Date().toISOString() }
  fs.writeFileSync(LOG_PATH, JSON.stringify(updated, null, 2), 'utf-8')
}

// ── Mutation ──────────────────────────────────────────────────────────────────

/**
 * Append a completed DiscoveryJob to the log.
 * Performs a single read-modify-write cycle.
 */
export function appendJob(job: DiscoveryJob): void {
  const store = getDiscoveryLog()
  store.jobs.push(job)
  saveDiscoveryLog(store)
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Return the most recent jobs, newest first.
 * Default limit: 10.
 */
export function getRecentJobs(limit = 10): DiscoveryJob[] {
  const store = getDiscoveryLog()
  return store.jobs.slice().reverse().slice(0, limit)
}

/** Return all jobs that targeted a specific vacancy ID. */
export function getJobsByVacancy(vacancyId: string): DiscoveryJob[] {
  const store = getDiscoveryLog()
  return store.jobs.filter(j => j.targetVacancyIds.includes(vacancyId))
}

/** Return all jobs that ran against a given source. */
export function getJobsBySource(source: DiscoveryJob['source']): DiscoveryJob[] {
  const store = getDiscoveryLog()
  return store.jobs.filter(j => j.source === source)
}

// ── Helper ────────────────────────────────────────────────────────────────────

function emptyLog(): DiscoveryLogStore {
  return { version: 1, updatedAt: new Date().toISOString(), jobs: [] }
}
