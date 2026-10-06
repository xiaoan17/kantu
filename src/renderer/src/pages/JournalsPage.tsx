import { useCallback, useEffect, useState } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import {
  JOURNAL_PREFERENCES,
  type JournalPreference,
  type JournalMeta
} from '../../../shared/contract'
import StatusBadge from '../components/StatusBadge'

function formatTime(iso: string | null): { date: string; time: string } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return {
    date: d.toLocaleDateString('zh-CN'),
    time: d.toLocaleTimeString('zh-CN', { hour12: false })
  }
}

function JournalsPage(): React.JSX.Element {
  const [journals, setJournals] = useState<JournalMeta[]>([])
  const [query, setQuery] = useState('')
  const [preferenceFilter, setPreferenceFilter] = useState<JournalPreference | ''>('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [preferenceError, setPreferenceError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setJournals(await window.tjm.listJournals())
  }, [])

  useEffect(() => {
    refresh()
    const off = window.tjm.onFetchProgress((p) => {
      if (p.status === 'fetching') {
        setJournals((current) =>
          current.map((j) => (j.id === p.journalId ? { ...j, fetchStatus: 'fetching' } : j))
        )
      } else {
        refresh()
      }
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

  const changePreference = async (id: string, preference: JournalPreference): Promise<void> => {
    setSavingId(id)
    setPreferenceError(null)
    try {
      await window.tjm.setJournalPreference(id, preference)
      await refresh()
    } catch (e) {
      setPreferenceError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
    }
  }

  const filtered = journals.filter(
    (j) =>
      j.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (!preferenceFilter || j.preference === preferenceFilter)
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-heading">期刊管理</h2>
        <div className="flex-1" />
        <select
          aria-label="按推荐偏好筛选"
          value={preferenceFilter}
          onChange={(e) => setPreferenceFilter(e.target.value as JournalPreference | '')}
          className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-body"
        >
          <option value="">全部偏好</option>
          {Object.entries(JOURNAL_PREFERENCES).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="按期刊名搜索…"
            className="w-64 rounded-lg border border-border-strong bg-surface py-2 pl-9 pr-3 text-sm text-body outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
          />
        </div>
      </div>

      {preferenceError && (
        <p role="alert" className="text-sm text-danger-text">
          偏好保存失败：{preferenceError}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl bg-surface shadow-sm ring-1 ring-border">
        <table className="w-full min-w-[960px] table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-14" />
            <col className="w-[60px]" />
            <col className="w-[148px]" />
            <col className="w-[88px]" />
            <col className="w-[72px]" />
            <col className="w-28" />
            <col className="w-[116px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-subtle text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-3">期刊名</th>
              <th className="px-3 py-3 text-right">IF</th>
              <th className="px-3 py-3 text-center">JCR</th>
              <th className="px-3 py-3">中科院大区</th>
              <th className="px-3 py-3 text-center">状态</th>
              <th className="whitespace-nowrap px-3 py-3 text-right">论文数</th>
              <th className="px-3 py-3">最近抓取</th>
              <th className="px-3 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((j) => {
              const fetchedAt = formatTime(j.lastFetchedAt)
              const isUpdating = updatingId === j.id || j.fetchStatus === 'fetching'
              return (
                <tr key={j.id} className="border-b border-border last:border-0 hover:bg-subtle">
                  <td className="break-words px-4 py-3 font-medium leading-5 text-heading">
                    {j.name}
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        aria-label={`${j.name} 的推荐偏好`}
                        value={j.preference}
                        disabled={savingId !== null}
                        onChange={(e) =>
                          void changePreference(j.id, e.target.value as JournalPreference)
                        }
                        className={`max-w-full rounded-md border border-border-strong px-2 py-1 text-xs font-normal disabled:opacity-50 ${j.preference === 'blocked' ? 'bg-danger-soft text-danger-text' : j.preference === 'followed' ? 'bg-primary-soft text-primary-strong' : 'bg-surface text-muted'}`}
                      >
                        {Object.entries(JOURNAL_PREFERENCES).map(([value, { label }]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {savingId === j.id && (
                        <span className="text-xs font-normal text-faint">保存中…</span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-body">
                    {j.impactFactor ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-center text-body">
                    {j.jcrQuartile ?? '—'}
                  </td>
                  <td className="break-words px-3 py-3 leading-5 text-body">{j.casMajor ?? '—'}</td>
                  <td className="px-3 py-3 text-center">
                    <StatusBadge status={j.fetchStatus} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-body">
                    {j.paperCount}
                  </td>
                  <td className="px-3 py-3 text-xs leading-5 tabular-nums text-muted">
                    {fetchedAt ? (
                      <time
                        dateTime={j.lastFetchedAt!}
                        className="inline-flex flex-col whitespace-nowrap"
                      >
                        <span>{fetchedAt.date}</span>
                        <span className="text-faint">{fetchedAt.time}</span>
                      </time>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => updateOne(j.id)}
                      disabled={updatingId !== null || j.fetchStatus === 'fetching'}
                      aria-label={`${isUpdating ? '正在更新' : '更新'} ${j.name}`}
                      aria-busy={isUpdating}
                      className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border-strong px-2.5 text-xs font-medium text-body hover:border-primary hover:bg-primary-soft hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw
                        size={14}
                        className={`shrink-0 ${isUpdating ? 'animate-spin' : ''}`}
                      />
                      {isUpdating ? '更新中…' : '更新该刊'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-faint">
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
