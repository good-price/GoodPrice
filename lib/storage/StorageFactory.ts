/**
 * lib/storage/StorageFactory.ts
 *
 * Singleton storage adapter for GOODPRICE OPS V3.
 *
 * All business-logic stores import `storage` from here instead of
 * importing from 'fs' directly. This allows future swap to Supabase,
 * Vercel KV, R2, etc. without touching domain code.
 *
 * SERVER-ONLY.
 */

import { LocalFileAdapter } from './LocalFileAdapter'
import type { StorageAdapter } from './StorageAdapter'

const _storage: StorageAdapter = new LocalFileAdapter()

export { _storage as storage }
