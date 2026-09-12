import { ipcMain, BrowserWindow, app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { IPC, DEFAULT_SETTINGS } from '../shared/contract'
import type {
  PapersQuery,
  RecommendInput,
  AppSettings,
  SettingsSnapshot,
  JournalMeta,
  FetchProgress,
  EmbedProgress
} from '../shared/contract'
import {
  initDatabase,
  seedJournals,
  listJournals,
  listPapers,
  getFetchSummary,
  setFetchRunning,
  isFetchRunning,
  clearEmbeddings,
  type JournalSeedEntry
} from './db'
import { startFetch } from './fetcher'
import { runEmbeddingForPending } from './embed'
import { recommend } from './recommend'
import { getSettings, setSettings } from './settings'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function seedPath(): string {
  return is.dev
    ? join(__dirname, '../../resources/journals.seed.json')
    : join(process.resourcesPath, 'journals.seed.json')
}

function loadSeed(): JournalSeedEntry[] {
  const p = seedPath()
  if (!existsSync(p)) {
    console.warn(`[seed] ${p} 不存在，跳过期刊种子导入`)
    return []
  }
  return JSON.parse(readFileSync(p, 'utf-8')) as JournalSeedEntry[]
}

export function initAppData(): void {
  initDatabase(join(app.getPath('userData'), 'tjm.db'))
  const seed = loadSeed()
  if (seed.length > 0) seedJournals(seed)
}

let embedRunning = false

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.journalsList, (): JournalMeta[] => listJournals())

  ipcMain.handle(IPC.fetchStart, (_e, journalIds?: string[]): void => {
    if (isFetchRunning()) return
    setFetchRunning(true)
    void startFetch(journalIds, (p: FetchProgress) => broadcast(IPC.evtFetchProgress, p))
      .catch((err) => console.error('[fetch] 失败', err))
      .finally(() => setFetchRunning(false))
  })

  ipcMain.handle(IPC.papersList, (_e, q: PapersQuery) => listPapers(q))

  ipcMain.handle(IPC.fetchSummary, () => getFetchSummary())

  ipcMain.handle(IPC.recommendRun, (_e, input: RecommendInput) => recommend(input))

  ipcMain.handle(IPC.embedRun, (): void => {
    if (embedRunning) return
    embedRunning = true
    void runEmbeddingForPending((p: EmbedProgress) => broadcast(IPC.evtEmbedProgress, p))
      .catch((err) => {
        console.error('[embed] 失败', err)
        const payload: EmbedProgress = {
          status: 'error',
          total: 0,
          done: 0,
          message: `向量化失败：${err instanceof Error ? err.message : String(err)}`
        }
        broadcast(IPC.evtEmbedProgress, payload)
      })
      .finally(() => {
        embedRunning = false
      })
  })

  ipcMain.handle(IPC.settingsGet, (): SettingsSnapshot => {
    const s = { ...DEFAULT_SETTINGS, ...getSettings() }
    return { ...s, embeddingApiKey: '', embeddingApiKeyConfigured: s.embeddingApiKey !== '' }
  })

  ipcMain.handle(IPC.settingsSet, (_e, s: AppSettings): void => {
    const prev = getSettings()
    // 渲染进程拿不到密钥明文，传空串表示保持原值
    const next: AppSettings = { ...s, embeddingApiKey: s.embeddingApiKey || prev.embeddingApiKey }
    setSettings(next)
    const modelChanged =
      prev.embeddingProvider !== next.embeddingProvider ||
      prev.localEmbeddingModel !== next.localEmbeddingModel ||
      (next.embeddingProvider === 'remote' &&
        (prev.embeddingBaseUrl !== next.embeddingBaseUrl ||
          prev.embeddingModel !== next.embeddingModel))
    if (modelChanged) {
      clearEmbeddings()
      console.log('[settings] embedding 模型配置已变更，已清空旧向量')
    }
  })
}
