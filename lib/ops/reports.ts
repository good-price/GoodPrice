/**
 * lib/ops/reports.ts
 *
 * Builds, persists, and loads the unified Ops Report.
 * The report is a snapshot of the entire platform operational state.
 *
 * File: data/ops/ops-report.json
 * SERVER-ONLY — uses Node.js fs.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { dirname }              from 'path'
import { dataPath } from '@/lib/data-path'
import { buildActivityLog }           from './activity-log'
import { generateAlerts }             from './alert-engine'
import { detectAnomalies }            from './anomaly-engine'
import { computePlatformHealthScore } from './system-health'
import { getQueueStatuses }           from './queue-monitor'
import { runDiagnostics }             from './diagnostics'
import type { OpsReport }             from './types'

// ── Path ──────────────────────────────────────────────────────────────────────

const REPORT_PATH = dataPath('data', 'ops', 'ops-report.json')

// ── I/O ───────────────────────────────────────────────────────────────────────

export function loadOpsReport(): OpsReport | null {
  if (!existsSync(REPORT_PATH)) return null
  try {
    return JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as OpsReport
  } catch {
    return null
  }
}

export function saveOpsReport(report: OpsReport): void {
  const dir = dirname(REPORT_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = REPORT_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(report, null, 2), 'utf8')
  renameSync(tmp, REPORT_PATH)
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Compute a fresh OpsReport from all subsystems.
 * Synchronous — all data is read from local files.
 * Typical execution: < 20ms.
 */
export function buildOpsReport(): OpsReport {
  const recentActivity = buildActivityLog(30)
  const alerts         = generateAlerts()
  const anomalies      = detectAnomalies(recentActivity)
  const health         = computePlatformHealthScore()
  const queues         = getQueueStatuses()
  const diagnostics    = runDiagnostics()

  return {
    generatedAt:    new Date().toISOString(),
    health,
    alerts,
    anomalies,
    queues,
    diagnostics,
    recentActivity,
  }
}
