/**
 * lib/ops/automation/index.ts
 *
 * Public API for the GOODPRICE OPS V3 Automation Engine.
 *
 * SERVER-ONLY.
 */

export type {
  AutomationJobType,
  AutomationDefinition,
  AutomationRunState,
  AutomationStateFile,
  AutomationRunResult,
} from './types'

export {
  DEFAULT_AUTOMATIONS,
  getAutomation,
  getAllAutomations,
  getEnabledAutomations,
} from './registry'

export {
  runAutomation,
  readAutomationState,
  computeNextRunAt,
} from './runner'
