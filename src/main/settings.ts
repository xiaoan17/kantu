import { app, safeStorage } from 'electron'
import { dirname, join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { DEFAULT_SETTINGS } from '../shared/contract'
import type { AppSettings } from '../shared/contract'

/** 落盘格式：API Key 优先以 safeStorage 加密存储（embeddingApiKeyEnc，base64）。 */
interface StoredSettings extends Partial<AppSettings> {
  embeddingApiKeyEnc?: string
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  try {
    const p = settingsPath()
    if (!existsSync(p)) return { ...DEFAULT_SETTINGS }
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as StoredSettings
    const { embeddingApiKeyEnc, ...rest } = raw
    const settings = { ...DEFAULT_SETTINGS, ...rest }
    if (!settings.embeddingApiKey && embeddingApiKeyEnc) {
      try {
        settings.embeddingApiKey = safeStorage.decryptString(
          Buffer.from(embeddingApiKeyEnc, 'base64')
        )
      } catch {
        // 解密失败（如系统钥匙串变更）按未配置处理，用户重新填写即可
      }
    }
    return settings
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function setSettings(s: AppSettings): void {
  const { embeddingApiKey, ...rest } = { ...DEFAULT_SETTINGS, ...s }
  const stored: StoredSettings = { ...rest, embeddingApiKey: '' }
  if (embeddingApiKey) {
    if (safeStorage.isEncryptionAvailable()) {
      stored.embeddingApiKeyEnc = safeStorage.encryptString(embeddingApiKey).toString('base64')
    } else {
      // 极少数平台不支持系统级加密时退回明文，保证功能可用
      stored.embeddingApiKey = embeddingApiKey
    }
  }
  const p = settingsPath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(stored, null, 2), 'utf-8')
}
