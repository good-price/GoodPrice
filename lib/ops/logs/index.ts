/**
 * lib/ops/logs/index.ts
 *
 * Public API for the GOODPRICE OPS V3 log engine.
 * Import from here — not from individual files within this module.
 *
 * Usage:
 *   import { appendLog, readLatestLogs } from '@/lib/ops/logs'
 */

// Types
export type {
  OpsJobType,
  OpsTrigger,
  OpsLogStatus,
  OpsLogActions,
  OpsLog,
  OpsLogDayFile,
  OpsLogIndexEntry,
  OpsLogIndex,
} from './types'

// Write
export { appendLog } from './writer'

// Read
export {
  readLogsByDate,
  readLatestLogs,
  readLogsSummary,
  getLastLogByJobType,
  getIndexEntryByDate,
  getLastCycleIndexEntry,
} from './reader'
