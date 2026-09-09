import { app } from 'electron'
import { dirname, join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { DEFAULT_SETTINGS } from '../shared/contract'
import type { AppSettings } from '../shared/contract'

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  try {
    const p = settingsPath()
    if (!existsSync(p)) return { ...DEFAULT_SETTINGS }
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as Partial<AppSettings>
    return { ...DEFAULT_SETTINGS, ...raw }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function setSettings(s: AppSettings): void {
  const p = settingsPath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify({ ...DEFAULT_SETTINGS, ...s }, null, 2), 'utf-8')
}
