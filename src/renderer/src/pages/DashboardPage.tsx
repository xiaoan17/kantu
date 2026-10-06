import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Cpu, AlertTriangle } from 'lucide-react'
import type {
  EmbedProgress,
  FetchProgress,
  FetchSummary,
  JournalMeta
} from '../../../shared/contract'
import ProgressBar from '../components/ProgressBar'

function StatCard({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-xl bg-surface p-5 shadow-sm ring-1 ring-border">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-3xl font-bold text-heading">{value}</div>
    </div>
  )
}

function DashboardPage(): React.JSX.Element {
  const [summary, setSummary] = useState<FetchSummary | null>(null)
  const [journals, setJournals] = useState<JournalMeta[]>([])
  const [fetchProgress, setFetchProgress] = useState<FetchProgress | null>(null)
  const [embedProgress, setEmbedProgress] = useState<EmbedProgress | null>(null)
  const [fetchStarting, setFetchStarting] = useState(false)
  const [embedStarting, setEmbedStarting] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const [s, j] = await Promise.all([window.tjm.getFetchSummary(), window.tjm.listJournals()])
    setSummary(s)
    setJournals(j)
  }, [])

  useEffect(() => {
    refresh()
    const offFetch = window.tjm.onFetchProgress((p) => {
      setFetchProgress(p)
      if (p.status !== 'fetching') refresh()
    })
    const offEmbed = window.tjm.onEmbedProgress((p) => {
      setEmbedProgress(p)
      if (p.status !== 'running') refresh()
    })
    return () => {
      offFetch()
      offEmbed()
    }
  }, [refresh])

  const startFetchAll = async (): Promise<void> => {
    setFetchStarting(true)
    try {
      await window.tjm.startFetch()
    } finally {
      setFetchStarting(false)
      refresh()
    }
  }

  const startEmbed = async (): Promise<void> => {
    setEmbedStarting(true)
    try {
      await window.tjm.runEmbedding()
    } finally {
      setEmbedStarting(false)
    }
  }

  const quartileCounts = journals.reduce<Record<string, number>>((acc, j) => {
    const key = j.jcrQuartile ?? '未知'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-heading">仪表盘</h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="期刊总数" value={summary?.totalJournals ?? 0} />
        <StatCard label="已抓取期刊" value={summary?.doneJournals ?? 0} />
        <StatCard label="论文总数" value={summary?.totalPapers ?? 0} />
        <StatCard label="有摘要论文" value={summary?.papersWithAbstract ?? 0} />
        <StatCard label="已向量化论文" value={summary?.papersWithEmbedding ?? 0} />
        <StatCard label="已撤稿论文" value={summary?.papersRetracted ?? 0} />
      </div>

      <div className="flex gap-3">
        <button
          onClick={startFetchAll}
          disabled={fetchStarting || summary?.running}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={16} className={fetchStarting ? 'animate-spin' : ''} />
          开始抓取全部期刊
        </button>
        <button
          onClick={startEmbed}
          disabled={embedStarting}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Cpu size={16} />
          运行向量化
        </button>
      </div>

      {fetchProgress && fetchProgress.status === 'fetching' && (
        <div className="rounded-xl bg-surface p-5 shadow-sm ring-1 ring-border">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-body">正在抓取：{fetchProgress.journalName}</span>
            <span className="text-muted">
              已抓 {fetchProgress.issuesFetched} 期 / {fetchProgress.papersFetched} 篇
            </span>
          </div>
          <ProgressBar value={summary?.doneJournals ?? 0} max={summary?.totalJournals ?? 0} />
          <p className="mt-2 text-xs text-muted">{fetchProgress.message}</p>
        </div>
      )}

      {embedProgress && embedProgress.status === 'running' && (
        <div className="rounded-xl bg-surface p-5 shadow-sm ring-1 ring-border">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-body">正在向量化</span>
            <span className="text-muted">
              {embedProgress.done} / {embedProgress.total}
            </span>
          </div>
          <ProgressBar value={embedProgress.done} max={embedProgress.total} />
          <p className="mt-2 text-xs text-muted">{embedProgress.message}</p>
        </div>
      )}

      {embedProgress && embedProgress.status === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-danger-border bg-danger-soft p-4 text-sm text-danger-text">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">向量化失败</p>
            <p className="mt-1">{embedProgress.message}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-surface p-5 shadow-sm ring-1 ring-border">
        <h3 className="mb-3 text-sm font-semibold text-body">期刊 JCR 分区分布</h3>
        {journals.length === 0 ? (
          <p className="text-sm text-faint">暂无期刊数据</p>
        ) : (
          <ul className="space-y-1.5">
            {Object.entries(quartileCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([q, count]) => (
                <li key={q} className="flex items-center justify-between text-sm">
                  <span className="text-body">{q}</span>
                  <span className="rounded-full bg-subtle px-2.5 py-0.5 text-xs font-medium text-body">
                    {count} 本
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default DashboardPage
