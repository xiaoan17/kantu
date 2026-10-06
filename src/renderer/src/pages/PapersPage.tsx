import { useCallback, useEffect, useRef, useState } from 'react'
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
    <div className="rounded-xl bg-surface p-5 shadow-sm ring-1 ring-border">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-semibold leading-snug text-heading">{paper.title}</h3>
        {doiUrl && (
          <a
            href={doiUrl}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
          >
            DOI <ExternalLink size={12} />
          </a>
        )}
      </div>
      <p className="mt-1 line-clamp-1 text-sm text-muted">{paper.authors}</p>
      <p className="mt-1 text-xs text-faint">
        {paper.publicationDate ?? '日期未知'}
        {(paper.volume || paper.issue) &&
          ` · Vol. ${paper.volume ?? '—'}${paper.issue ? `, Issue ${paper.issue}` : ''}`}
      </p>
      {paper.abstract && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? '收起摘要' : '展开摘要'}
          </button>
          {expanded && (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-body">
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
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  // 请求序号：快速切换筛选时丢弃晚到的过期响应，避免旧结果覆盖新结果
  const requestSeq = useRef(0)

  useEffect(() => {
    window.tjm.listJournals().then(setJournals)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  const load = useCallback(
    async (offset: number, append: boolean): Promise<void> => {
      const seq = ++requestSeq.current
      setLoading(true)
      try {
        const list = await window.tjm.listPapers({
          journalId: journalId || undefined,
          query: debouncedQuery.trim() || undefined,
          limit: PAGE_SIZE,
          offset
        })
        if (seq !== requestSeq.current) return
        setPapers((prev) => (append ? [...prev, ...list] : list))
        setHasMore(list.length === PAGE_SIZE)
      } finally {
        if (seq === requestSeq.current) setLoading(false)
      }
    },
    [journalId, debouncedQuery]
  )

  useEffect(() => {
    load(0, false)
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-heading">论文库</h2>
        <div className="flex-1" />
        <select
          value={journalId}
          onChange={(e) => setJournalId(e.target.value)}
          className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-body outline-none focus:border-primary"
        >
          <option value="">全部期刊</option>
          {journals.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题 / 摘要…"
            className="w-64 rounded-lg border border-border-strong bg-surface py-2 pl-9 pr-3 text-sm text-body outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
          />
        </div>
      </div>

      <div className="space-y-3">
        {papers.map((p) => (
          <PaperCard key={p.id} paper={p} />
        ))}
        {papers.length === 0 && !loading && (
          <p className="py-10 text-center text-sm text-faint">暂无论文，请先在仪表盘抓取期刊</p>
        )}
      </div>

      {loading && <p className="py-4 text-center text-sm text-faint">加载中…</p>}
      {hasMore && !loading && (
        <div className="text-center">
          <button
            onClick={() => load(papers.length, true)}
            className="rounded-lg border border-border-strong bg-surface px-5 py-2 text-sm font-medium text-body hover:bg-subtle"
          >
            加载更多
          </button>
        </div>
      )}
    </div>
  )
}

export default PapersPage
