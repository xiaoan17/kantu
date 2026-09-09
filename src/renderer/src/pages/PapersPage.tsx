import { useCallback, useEffect, useState } from 'react'
import { Search, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import type { JournalMeta, Paper } from '../../../shared/contract'

const PAGE_SIZE = 100

function PaperCard({ paper }: { paper: Paper }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const doiUrl = paper.doi
    ? paper.doi.startsWith('http')
      ? paper.doi
      : `https://doi.org/${paper.doi}`
    : null

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-semibold leading-snug text-slate-800">{paper.title}</h3>
        {doiUrl && (
          <a
            href={doiUrl}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            DOI <ExternalLink size={12} />
          </a>
        )}
      </div>
      <p className="mt-1 line-clamp-1 text-sm text-slate-500">{paper.authors}</p>
      <p className="mt-1 text-xs text-slate-400">
        {paper.publicationDate ?? '日期未知'}
        {(paper.volume || paper.issue) &&
          ` · Vol. ${paper.volume ?? '—'}${paper.issue ? `, Issue ${paper.issue}` : ''}`}
      </p>
      {paper.abstract && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? '收起摘要' : '展开摘要'}
          </button>
          {expanded && (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
              {paper.abstract}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function PapersPage(): React.JSX.Element {
  const [journals, setJournals] = useState<JournalMeta[]>([])
  const [journalId, setJournalId] = useState('')
  const [query, setQuery] = useState('')
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    window.tjm.listJournals().then(setJournals)
  }, [])

  const load = useCallback(
    async (offset: number, append: boolean): Promise<void> => {
      setLoading(true)
      try {
        const list = await window.tjm.listPapers({
          journalId: journalId || undefined,
          query: query.trim() || undefined,
          limit: PAGE_SIZE,
          offset
        })
        setPapers((prev) => (append ? [...prev, ...list] : list))
        setHasMore(list.length === PAGE_SIZE)
      } finally {
        setLoading(false)
      }
    },
    [journalId, query]
  )

  useEffect(() => {
    load(0, false)
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-slate-800">论文库</h2>
        <div className="flex-1" />
        <select
          value={journalId}
          onChange={(e) => setJournalId(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          <option value="">全部期刊</option>
          {journals.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题 / 摘要…"
            className="w-64 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="space-y-3">
        {papers.map((p) => (
          <PaperCard key={p.id} paper={p} />
        ))}
        {papers.length === 0 && !loading && (
          <p className="py-10 text-center text-sm text-slate-400">暂无论文，请先在仪表盘抓取期刊</p>
        )}
      </div>

      {loading && <p className="py-4 text-center text-sm text-slate-400">加载中…</p>}
      {hasMore && !loading && (
        <div className="text-center">
          <button
            onClick={() => load(papers.length, true)}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            加载更多
          </button>
        </div>
      )}
    </div>
  )
}

export default PapersPage
