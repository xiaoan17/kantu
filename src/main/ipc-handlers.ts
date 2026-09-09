import { ipcMain, BrowserWindow, app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { IPC, DEFAULT_SETTINGS } from '../shared/contract'
import type {
  PapersQuery,
  RecommendInput,
  AppSettings,
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

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.journalsList, (): JournalMeta[] => listJournals())

  ipcMain.handle(IPC.fetchStart, async (_e, journalIds?: string[]): Promise<void> => {
    setFetchRunning(true)
    void startFetch(journalIds, (p: FetchProgress) => broadcast(IPC.evtFetchProgress, p))
      .catch((err) => console.error('[fetch] 失败', err))
      .finally(() => setFetchRunning(false))
  })

  ipcMain.handle(IPC.papersList, (_e, q: PapersQuery) => listPapers(q))

  ipcMain.handle(IPC.fetchSummary, () => getFetchSummary())

  ipcMain.handle(IPC.recommendRun, (_e, input: RecommendInput) => recommend(input))

  ipcMain.handle(IPC.embedRun, async (): Promise<void> => {
    void runEmbeddingForPending((p: EmbedProgress) =>
      broadcast(IPC.evtEmbedProgress, p)
    ).catch((err) => {
      console.error('[embed] 失败', err)
      broadcast(IPC.evtEmbedProgress, {
        total: 1,
        done: 0,
        message: `向量化失败：${err instanceof Error ? err.message : String(err)}`
      })
    })
  })

  ipcMain.handle(IPC.settingsGet, (): AppSettings => ({ ...DEFAULT_SETTINGS, ...getSettings() }))

  ipcMain.handle(IPC.settingsSet, (_e, s: AppSettings): void => {
    const prev = getSettings()
    setSettings(s)
    const modelChanged =
      prev.embeddingProvider !== s.embeddingProvider ||
      prev.localEmbeddingModel !== s.localEmbeddingModel ||
      (s.embeddingProvider === 'remote' &&
        (prev.embeddingBaseUrl !== s.embeddingBaseUrl || prev.embeddingModel !== s.embeddingModel))
    if (modelChanged) {
      clearEmbeddings()
      console.log('[settings] embedding 模型配置已变更，已清空旧向量')
    }
  })
}
