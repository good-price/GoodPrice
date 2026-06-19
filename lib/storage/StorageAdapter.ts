/**
 * lib/storage/StorageAdapter.ts
 *
 * Abstract interface for key-value blob storage — Sprint 5C.
 *
 * All implementations MUST:
 *   - Be synchronous
 *   - Never throw — communicate failure via null / false return values
 *   - Auto-create parent directories on write (where applicable)
 *
 * This abstraction exists so business logic in lib/catalog/** can later be
 * migrated to Supabase, Vercel KV, R2, or any other backend without
 * changing a single line of domain code. LocalFileAdapter is the current
 * implementation; a future KvAdapter would implement the same interface.
 *
 * Key conventions:
 *   - Keys are storage-backend-specific. LocalFileAdapter uses absolute
 *     file paths; a KV adapter would use opaque string keys.
 *   - Data is always UTF-8 encoded JSON strings.
 *   - rename() is used for OPS V3 atomic writes (tmp → target).
 *
 * SERVER-ONLY.
 */

export interface StorageAdapter {
  /** Read a blob by key. Returns null on miss or read error. */
  read(key: string): string | null

  /** Write a blob. Returns true on success, false on failure. */
  write(key: string, data: string): boolean

  /** Returns true if the key exists. */
  exists(key: string): boolean

  /**
   * Atomically rename src → dst.
   * Used for OPS V3 tmp → target writes.
   * Returns true on success, false on failure.
   */
  rename(src: string, dst: string): boolean

  /**
   * Delete a blob.
   * Returns true on success, false if key is absent or on error.
   */
  delete(key: string): boolean

  /**
   * Copy src → dst.
   * Returns true on success, false on failure.
   */
  copy(src: string, dst: string): boolean
}
