import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Cpu } from 'lucide-react'
import type { EmbedProgress, FetchProgress, FetchSummary, JournalMeta } from '../../../shared/contract'
import ProgressBar from '../components/ProgressBar'

function StatCard({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-slate-800">{value}</div>
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
      if (p.done >= p.total) refresh()
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
      <h2 className="text-xl font-bold text-slate-800">仪表盘</h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="期刊总数" value={summary?.totalJournals ?? 0} />
        <StatCard label="已抓取期刊" value={summary?.doneJournals ?? 0} />
        <StatCard label="论文总数" value={summary?.totalPapers ?? 0} />
        <StatCard label="有摘要论文" value={summary?.papersWithAbstract ?? 0} />
        <StatCard label="已向量化论文" value={summary?.papersWithEmbedding ?? 0} />
      </div>

      <div className="flex gap-3">
        <button
          onClick={startFetchAll}
          disabled={fetchStarting || summary?.running}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">
              正在抓取：{fetchProgress.journalName}
            </span>
            <span className="text-slate-500">
              已抓 {fetchProgress.issuesFetched} 期 / {fetchProgress.papersFetched} 篇
            </span>
          </div>
          <ProgressBar
            value={summary?.doneJournals ?? 0}
            max={summary?.totalJournals ?? 0}
          />
          <p className="mt-2 text-xs text-slate-500">{fetchProgress.message}</p>
        </div>
      )}

      {embedProgress && embedProgress.done < embedProgress.total && (
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">正在向量化</span>
            <span className="text-slate-500">
              {embedProgress.done} / {embedProgress.total}
            </span>
          </div>
          <ProgressBar value={embedProgress.done} max={embedProgress.total} />
          <p className="mt-2 text-xs text-slate-500">{embedProgress.message}</p>
        </div>
      )}

      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">期刊 JCR 分区分布</h3>
        {journals.length === 0 ? (
          <p className="text-sm text-slate-400">暂无期刊数据</p>
        ) : (
          <ul className="space-y-1.5">
            {Object.entries(quartileCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([q, count]) => (
                <li key={q} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{q}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
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
