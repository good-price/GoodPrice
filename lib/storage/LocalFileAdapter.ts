/**
 * lib/storage/LocalFileAdapter.ts
 *
 * StorageAdapter implementation backed by the local filesystem — Sprint 5C.
 *
 * All operations are synchronous and never throw.
 * Keys are absolute file paths.
 *
 * Matches the write pattern used throughout OPS V3:
 *   adapter.write(tmpPath, data)
 *   adapter.rename(tmpPath, targetPath)
 *
 * SERVER-ONLY.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { dirname } from 'path'
import type { StorageAdapter } from './StorageAdapter'

export class LocalFileAdapter implements StorageAdapter {
  read(key: string): string | null {
    try {
      if (!existsSync(key)) return null
      return readFileSync(key, 'utf-8')
    } catch {
      return null
    }
  }

  write(key: string, data: string): boolean {
    try {
      mkdirSync(dirname(key), { recursive: true })
      writeFileSync(key, data, 'utf-8')
      return true
    } catch {
      return false
    }
  }

  exists(key: string): boolean {
    try {
      return existsSync(key)
    } catch {
      return false
    }
  }

  rename(src: string, dst: string): boolean {
    try {
      renameSync(src, dst)
      return true
    } catch {
      return false
    }
  }

  delete(key: string): boolean {
    try {
      if (!existsSync(key)) return false
      unlinkSync(key)
      return true
    } catch {
      return false
    }
  }

  copy(src: string, dst: string): boolean {
    try {
      mkdirSync(dirname(dst), { recursive: true })
      copyFileSync(src, dst)
      return true
    } catch {
      return false
    }
  }
}
