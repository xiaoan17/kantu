import { useCallback, useEffect, useState } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import type { JournalMeta } from '../../../shared/contract'
import StatusBadge from '../components/StatusBadge'

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN')
}

function JournalsPage(): React.JSX.Element {
  const [journals, setJournals] = useState<JournalMeta[]>([])
  const [query, setQuery] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setJournals(await window.tjm.listJournals())
  }, [])

  useEffect(() => {
    refresh()
    const off = window.tjm.onFetchProgress((p) => {
      if (p.status !== 'fetching') refresh()
    })
    return off
  }, [refresh])

  const updateOne = async (id: string): Promise<void> => {
    setUpdatingId(id)
    try {
      await window.tjm.startFetch([id])
    } finally {
      setUpdatingId(null)
      refresh()
    }
  }

  const filtered = journals.filter((j) =>
    j.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">期刊管理</h2>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="按期刊名搜索…"
            className="w-64 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">期刊名</th>
              <th className="px-4 py-3">IF</th>
              <th className="px-4 py-3">JCR</th>
              <th className="px-4 py-3">中科院大区</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3 text-right">论文数</th>
              <th className="px-4 py-3">最近抓取</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((j) => (
              <tr key={j.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{j.name}</td>
                <td className="px-4 py-3 text-slate-600">{j.impactFactor ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{j.jcrQuartile ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{j.casMajor ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={j.fetchStatus} />
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{j.paperCount}</td>
                <td className="px-4 py-3 text-slate-500">{formatTime(j.lastFetchedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => updateOne(j.id)}
                    disabled={updatingId !== null || j.fetchStatus === 'fetching'}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={updatingId === j.id ? 'animate-spin' : ''} />
                    更新该刊
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  没有匹配的期刊
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default JournalsPage
