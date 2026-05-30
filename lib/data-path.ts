/**
 * lib/data-path.ts
 *
 * Central helper for writable runtime data paths.
 *
 * Vercel lambdas mount the deployment bundle at /var/task (read-only).
 * The only writable location is /tmp (ephemeral, ~512 MB, per-instance).
 *
 * On Vercel  (VERCEL=1):  base = /tmp
 * Locally / CI:           base = process.cwd()
 *
 * Usage:
 *   import { dataPath } from '@/lib/data-path'
 *   const STORE_PATH = dataPath('data', 'ops', 'actions', 'overrides.json')
 */

import { join } from 'path'

function dataRoot(): string {
  return process.env.VERCEL ? '/tmp' : process.cwd()
}

export function dataPath(...segments: string[]): string {
  return join(dataRoot(), ...segments)
}
