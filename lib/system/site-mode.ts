import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

export type SiteMode = 'public' | 'development'

export interface SiteModeState {
  mode:         SiteMode
  updatedAt:    string | null
  previousMode: SiteMode | null
}

const ALLOWED_MODES: SiteMode[] = ['public', 'development']
const MODE_PATH = join(process.cwd(), 'data', 'system', 'site-mode.json')

function isAllowedMode(value: unknown): value is SiteMode {
  return ALLOWED_MODES.includes(value as SiteMode)
}

export function readSiteMode(): SiteModeState {
  if (!existsSync(MODE_PATH)) {
    return { mode: 'public', updatedAt: null, previousMode: null }
  }
  try {
    const raw   = readFileSync(MODE_PATH, 'utf-8')
    const data  = JSON.parse(raw) as Record<string, unknown>
    const mode  = isAllowedMode(data.mode) ? data.mode : 'public'
    const prev  = isAllowedMode(data.previousMode) ? data.previousMode : null
    const upd   = typeof data.updatedAt === 'string' ? data.updatedAt : null
    return { mode, updatedAt: upd, previousMode: prev }
  } catch {
    return { mode: 'public', updatedAt: null, previousMode: null }
  }
}

export function setSiteMode(newMode: SiteMode): SiteModeState {
  if (!isAllowedMode(newMode)) {
    throw new Error(`Invalid site mode: "${newMode}". Allowed: ${ALLOWED_MODES.join(', ')}`)
  }
  const current = readSiteMode()
  const state: SiteModeState = {
    mode:         newMode,
    updatedAt:    new Date().toISOString(),
    previousMode: current.mode,
  }
  mkdirSync(join(process.cwd(), 'data', 'system'), { recursive: true })
  writeFileSync(MODE_PATH, JSON.stringify(state, null, 2), 'utf-8')
  return state
}
