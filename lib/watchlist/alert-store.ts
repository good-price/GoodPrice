/**
 * GOODPRICE Watchlist — Alert Subscription File Store
 *
 * Persists email alert subscriptions to data/watchlist/subscriptions.json.
 * Server-side only — never import in client components.
 *
 * Swap path: replace with a Supabase table query when moving to production.
 * Interface contract is kept minimal so swapping is a one-file change.
 */

import fs   from 'fs/promises'
import path from 'path'
import type { AlertSubscription, SubscriptionStore } from './types'

// ── Paths ─────────────────────────────────────────────────────────────────────

const DATA_DIR  = path.join(process.cwd(), 'data', 'watchlist')
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json')

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

async function readAll(): Promise<SubscriptionStore> {
  try {
    const content = await fs.readFile(SUBS_FILE, 'utf-8')
    return JSON.parse(content) as SubscriptionStore
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
}

async function writeAll(store: SubscriptionStore): Promise<void> {
  await ensureDir()
  await fs.writeFile(SUBS_FILE, JSON.stringify(store, null, 2), 'utf-8')
}

// ── UUID generator (no crypto dependency) ────────────────────────────────────

function generateId(): string {
  const chars = '0123456789abcdef'
  let uuid = 'sub_'
  for (let i = 0; i < 32; i++) {
    uuid += chars[Math.floor(Math.random() * 16)]
    if (i === 7 || i === 11 || i === 15 || i === 19) uuid += '-'
  }
  return uuid
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Create a new alert subscription. Returns the created subscription. */
export async function createSubscription(
  input: Omit<AlertSubscription, 'id' | 'createdAt' | 'lastTriggeredAt' | 'lastCheckedAt' | 'isActive'>,
): Promise<AlertSubscription> {
  const store = await readAll()

  const subscription: AlertSubscription = {
    ...input,
    id:              generateId(),
    createdAt:       new Date().toISOString(),
    lastTriggeredAt: null,
    lastCheckedAt:   null,
    isActive:        true,
  }

  store[subscription.id] = subscription
  await writeAll(store)
  return subscription
}

/** Get all active subscriptions. */
export async function getActiveSubscriptions(): Promise<AlertSubscription[]> {
  const store = await readAll()
  return Object.values(store).filter(s => s.isActive)
}

/** Get all subscriptions for a given anonymous user ID. */
export async function getSubscriptionsByAnonId(
  anonId: string,
): Promise<AlertSubscription[]> {
  const store = await readAll()
  return Object.values(store).filter(s => s.anonId === anonId)
}

/** Get a single subscription by ID. Returns null if not found. */
export async function getSubscription(
  id: string,
): Promise<AlertSubscription | null> {
  const store = await readAll()
  return store[id] ?? null
}

/** Soft-delete a subscription (marks isActive = false). */
export async function deactivateSubscription(id: string): Promise<boolean> {
  const store = await readAll()
  if (!store[id]) return false
  store[id] = { ...store[id], isActive: false }
  await writeAll(store)
  return true
}

/** Update lastTriggeredAt and lastCheckedAt after a detection run. */
export async function markSubscriptionChecked(
  id: string,
  triggered: boolean,
): Promise<void> {
  const store = await readAll()
  if (!store[id]) return

  const now = new Date().toISOString()
  store[id] = {
    ...store[id],
    lastCheckedAt:   now,
    lastTriggeredAt: triggered ? now : store[id].lastTriggeredAt,
  }
  await writeAll(store)
}
