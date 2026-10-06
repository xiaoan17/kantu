/**
 * 共享契约：主进程 / preload / 渲染进程三方共用的类型与 IPC 通道定义。
 * 所有并行开发模块必须严格遵守本文件的签名，不得改名。
 */

// ---------- 数据模型 ----------

export interface JournalMeta {
  id: string // 稳定 slug，如 'transportation-research-part-c'
  name: string
  issn: string | null // 用于 OpenAlex 查询的 ISSN（print 优先，其次 electronic）
  openalexSourceId: string | null // 如 'S123456789'
  impactFactor: number | null
  jcrQuartile: string | null // 'Q1' | 'Q2' | 'Q3' | 'Q4'（多分类期刊取最好分区）
  casMajor: string | null // 中科院大区，如 '工程技术(1区)'
  casMinor: string | null // 中科院小区原始字符串
  fetchStatus: 'pending' | 'fetching' | 'done' | 'error'
  lastFetchedAt: string | null // ISO 时间
  paperCount: number
}

export interface Paper {
  id: string // OpenAlex work id 尾段，如 'W123456789'
  journalId: string
  volume: string | null
  issue: string | null
  publicationDate: string | null
  title: string
  abstract: string | null
  doi: string | null
  authors: string // 逗号分隔
  citedByCount: number
  hasEmbedding: boolean
}

// ---------- 推荐 ----------

export interface RecommendFilters {
  jcrQuartiles?: string[] // 如 ['Q1','Q2']，按期刊 jcrQuartile 精确匹配
  casZoneMax?: number | null // 中科院大区最高接受分区，如 2 表示只留 1区/2区
}

export interface RecommendInput {
  title: string
  abstract: string
  filters?: RecommendFilters
}

export interface EvidencePaper {
  paperId: string
  title: string
  publicationDate: string | null
  doi: string | null
  similarity: number // 0-1 cosine
}

export interface JournalRecommendation {
  journal: JournalMeta
  score: number // 期刊聚合得分（Top-10 相似度之和 / 10，语料不足 10 篇的期刊按缺失计 0，避免小样本占优）
  evidence: EvidencePaper[] // 每刊 Top-3
}

// ---------- 设置 ----------

export type EmbeddingProvider = 'local' | 'remote'

export interface LocalEmbeddingModelOption {
  id: string // fastembed 模型 id
  label: string
  dim: number
}

export const LOCAL_EMBEDDING_MODELS: LocalEmbeddingModelOption[] = [
  {
    id: 'bge-small-en-v1.5',
    label: 'BGE Small EN v1.5（384 维，已随应用内置）',
    dim: 384
  }
]

export interface AppSettings {
  embeddingProvider: EmbeddingProvider // 默认 'local'：内置 ONNX 模型离线推理
  localEmbeddingModel: string // LOCAL_EMBEDDING_MODELS 中的 id
  embeddingBaseUrl: string // OpenAI 兼容端点，默认 https://api.openai.com/v1
  embeddingApiKey: string // settingsGet 返回时恒为空串（密钥不回传渲染进程）；settingsSet 传空串表示保持原值
  embeddingModel: string // 默认 'text-embedding-3-small'
  mailto: string // OpenAlex 礼貌池邮箱，可空
  theme: string // 界面主题 id（见 renderer/src/themes.ts），默认 'light'
}

/** settingsGet 返回给渲染进程的快照：不含密钥明文，只带"是否已配置"标记。 */
export interface SettingsSnapshot extends AppSettings {
  embeddingApiKeyConfigured: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  embeddingProvider: 'local',
  localEmbeddingModel: 'bge-small-en-v1.5',
  embeddingBaseUrl: 'https://api.openai.com/v1',
  embeddingApiKey: '',
  embeddingModel: 'text-embedding-3-small',
  mailto: '',
  theme: 'light'
}

// ---------- 抓取进度（主进程 → 渲染进程事件） ----------

export interface FetchProgress {
  journalId: string
  journalName: string
  status: 'fetching' | 'done' | 'error'
  issuesFetched: number
  papersFetched: number
  message: string
}

export interface EmbedProgress {
  status: 'running' | 'done' | 'error'
  total: number
  done: number
  message: string
}

export interface FetchSummary {
  totalJournals: number
  doneJournals: number
  totalPapers: number
  papersWithAbstract: number
  papersWithEmbedding: number
  running: boolean
}

// ---------- IPC 通道名（invoke 一律 'tjm:' 前缀） ----------

export const IPC = {
  journalsList: 'tjm:journals:list',
  fetchStart: 'tjm:fetch:start', // (journalIds?: string[]) => void，不传则全部
  fetchSummary: 'tjm:fetch:summary', // () => FetchSummary
  papersList: 'tjm:papers:list', // (q: PapersQuery) => Paper[]
  recommendRun: 'tjm:recommend:run', // (input: RecommendInput) => JournalRecommendation[]
  embedRun: 'tjm:embed:run', // () => void（对缺 embedding 的论文批量嵌入，进度走事件）
  settingsGet: 'tjm:settings:get', // () => AppSettings
  settingsSet: 'tjm:settings:set', // (s: AppSettings) => void
  // events (main -> renderer, webContents.send)
  evtFetchProgress: 'tjm:evt:fetch-progress', // FetchProgress
  evtEmbedProgress: 'tjm:evt:embed-progress' // EmbedProgress
} as const

export interface PapersQuery {
  journalId?: string
  query?: string // 标题/摘要模糊搜索
  limit?: number
  offset?: number
}

// ---------- 渲染进程可调用的 API（preload 暴露为 window.tjm） ----------

export interface TjmApi {
  listJournals(): Promise<JournalMeta[]>
  startFetch(journalIds?: string[]): Promise<void>
  getFetchSummary(): Promise<FetchSummary>
  listPapers(q: PapersQuery): Promise<Paper[]>
  runRecommend(input: RecommendInput): Promise<JournalRecommendation[]>
  runEmbedding(): Promise<void>
  getSettings(): Promise<SettingsSnapshot>
  setSettings(s: AppSettings): Promise<void>
  onFetchProgress(cb: (p: FetchProgress) => void): () => void
  onEmbedProgress(cb: (p: EmbedProgress) => void): () => void
}
