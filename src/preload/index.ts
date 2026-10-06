import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/contract'
import type {
  TjmApi,
  AppSettings,
  PapersQuery,
  RecommendInput,
  FetchProgress,
  EmbedProgress
} from '../shared/contract'

const api: TjmApi = {
  listJournals: () => ipcRenderer.invoke(IPC.journalsList),
  setJournalPreference: (id, preference) =>
    ipcRenderer.invoke(IPC.journalPreferenceSet, id, preference),
  startFetch: (journalIds?: string[]) => ipcRenderer.invoke(IPC.fetchStart, journalIds),
  getFetchSummary: () => ipcRenderer.invoke(IPC.fetchSummary),
  listPapers: (q: PapersQuery) => ipcRenderer.invoke(IPC.papersList, q),
  runRecommend: (input: RecommendInput) => ipcRenderer.invoke(IPC.recommendRun, input),
  runEmbedding: () => ipcRenderer.invoke(IPC.embedRun),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (s: AppSettings) => ipcRenderer.invoke(IPC.settingsSet, s),
  onFetchProgress: (cb: (p: FetchProgress) => void) => {
    const listener = (_e: unknown, p: FetchProgress): void => cb(p)
    ipcRenderer.on(IPC.evtFetchProgress, listener)
    return () => ipcRenderer.removeListener(IPC.evtFetchProgress, listener)
  },
  onEmbedProgress: (cb: (p: EmbedProgress) => void) => {
    const listener = (_e: unknown, p: EmbedProgress): void => cb(p)
    ipcRenderer.on(IPC.evtEmbedProgress, listener)
    return () => ipcRenderer.removeListener(IPC.evtEmbedProgress, listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('tjm', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.tjm = api
}
