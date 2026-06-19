/**
 * lib/ops/runtime/index.ts
 *
 * Public API for the GOODPRICE OPS V3 Runtime Engine.
 *
 * SERVER-ONLY.
 */

// Types
export type {
  MasterCycleState,
  JobRuntimeState,
  JobStatesFile,
  SystemHealth,
} from './types'

// Readers
export {
  readMasterCycleState,
  readJobStates,
  readJobState,
  readSystemHealth,
} from './reader'

// Writers
export {
  writeCycleStart,
  writeCurrentStage,
  writeCycleEnd,
  updateJobState,
  writeSystemHealth,
  computeHealthScore,
  flushSystemHealth,
} from './writer'

// Metrics
export {
  getAverageDuration,
  getJobSuccessRate,
  getFailureRate,
  getCycleSuccessRate,
} from './metrics'
