/**
 * lib/ops/scheduler/index.ts
 *
 * Public API for the GOODPRICE OPS V3 Countdown Engine and schedule registry.
 * Import from here — not from individual files within this module.
 *
 * Usage:
 *   import { getAllCountdowns, getCycleCountdown, formatCountdown } from '@/lib/ops/scheduler'
 */

export type {
  ScheduledJobConfig,
  JobCountdown,
  CycleCountdown,
  AllCountdowns,
} from './types'

export { JOB_SCHEDULES, getJobSchedule } from './schedule'

export {
  getJobCountdown,
  getCycleCountdown,
  getAllCountdowns,
  formatCountdown,
} from './countdown'
