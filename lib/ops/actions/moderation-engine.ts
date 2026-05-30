/**
 * lib/ops/actions/moderation-engine.ts
 *
 * Operator moderation tools: notes, risk levels, pins, flags.
 *
 * Moderation data is advisory — it does NOT affect visibility or tier.
 * It provides operators with a shared annotation layer over the catalog.
 *
 * Storage: data/ops/actions/moderation.json
 *
 * SERVER-ONLY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import type { ModerationEntry, ModerationNote, ModerationStore, RiskLevel } from './types'

// ── Path ───────────────────────────────────────────────────────────────────────

const STORE_PATH = join(process.cwd(), 'data', 'ops', 'actions', 'moderation.json')

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_NOTE_LENGTH = 500
const MAX_NOTES_PER_PRODUCT = 20

// ── I/O ────────────────────────────────────────────────────────────────────────

function ensureDir(): void {
  const dir = dirname(STORE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function readStore(): ModerationStore {
  ensureDir()
  if (!existsSync(STORE_PATH)) return { updatedAt: '', entries: {} }
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as ModerationStore
  } catch {
    return { updatedAt: '', entries: {} }
  }
}

function writeStore(store: ModerationStore): void {
  ensureDir()
  const tmp = STORE_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, STORE_PATH)
}

function getNow(): string {
  return new Date().toISOString()
}

function generateId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function getOrCreate(store: ModerationStore, productId: string): ModerationEntry {
  if (!store.entries[productId]) {
    store.entries[productId] = {
      productId,
      riskLevel:  null,
      notes:      [],
      flaggedAt:  null,
      flaggedBy:  null,
      updatedAt:  getNow(),
    }
  }
  return store.entries[productId]
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Adds a moderation note to a product.
 */
export function addNote(
  productId: string,
  operator:  string,
  text:      string,
  pinned:    boolean = false,
): ModerationNote {
  const store = readStore()
  const entry = getOrCreate(store, productId)

  const note: ModerationNote = {
    id:        generateId(),
    productId,
    operator,
    text:      text.slice(0, MAX_NOTE_LENGTH),
    createdAt: getNow(),
    pinned,
  }

  // Prepend, keep max
  entry.notes = [note, ...entry.notes].slice(0, MAX_NOTES_PER_PRODUCT)
  entry.updatedAt = note.createdAt
  store.updatedAt  = note.createdAt

  writeStore(store)
  return note
}

/**
 * Pins or unpins a note.
 */
export function toggleNotePin(productId: string, noteId: string): boolean {
  const store = readStore()
  const entry = store.entries[productId]
  if (!entry) return false

  const note = entry.notes.find(n => n.id === noteId)
  if (!note) return false

  note.pinned  = !note.pinned
  entry.updatedAt = getNow()
  store.updatedAt  = entry.updatedAt

  writeStore(store)
  return note.pinned
}

/**
 * Sets the risk level for a product.
 */
export function setRiskLevel(
  productId: string,
  operator:  string,
  level:     RiskLevel | null,
): void {
  const store = readStore()
  const entry = getOrCreate(store, productId)

  entry.riskLevel = level
  if (level !== null) {
    entry.flaggedAt = getNow()
    entry.flaggedBy = operator
  } else {
    entry.flaggedAt = null
    entry.flaggedBy = null
  }
  entry.updatedAt = getNow()
  store.updatedAt  = entry.updatedAt

  writeStore(store)
}

/**
 * Returns the moderation entry for a product, or null.
 */
export function getModerationEntry(productId: string): ModerationEntry | null {
  const store = readStore()
  return store.entries[productId] ?? null
}

/**
 * Returns all moderation entries as a Map for bulk lookup.
 */
export function loadAllModerationEntries(): Map<string, ModerationEntry> {
  const store = readStore()
  return new Map(Object.entries(store.entries))
}

/**
 * Returns all products with a non-null risk level, sorted by severity.
 */
export function getFlaggedProducts(): ModerationEntry[] {
  const store = readStore()
  const order: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  return Object.values(store.entries)
    .filter(e => e.riskLevel !== null)
    .sort((a, b) => order[a.riskLevel!] - order[b.riskLevel!])
}
