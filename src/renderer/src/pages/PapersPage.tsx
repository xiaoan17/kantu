import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, ChevronDown, ChevronUp, ExternalLink, AlertTriangle } from 'lucide-react'
import type { AbstractFilter, JournalMeta, Paper } from '../../../shared/contract'

const PAGE_SIZE = 10

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
        <div className="min-w-0">
          {paper.isRetracted && (
            <span
              title="OpenAlex 标记为已撤稿，已排除出推荐语料"
              className="mb-1 inline-flex items-center gap-1 rounded-full border border-danger-border bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger-text"
            >
              <AlertTriangle size={12} />
              已撤稿
            </span>
          )}
          <h3 className="font-semibold leading-snug text-heading">{paper.title}</h3>
        </div>
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
      {paper.abstract?.trim() ? (
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
      ) : (
        <p className="mt-3 text-xs text-faint">暂无摘要</p>
      )}
    </div>
  )
}

function PapersPage(): React.JSX.Element {
  const [journals, setJournals] = useState<JournalMeta[]>([])
  const [journalId, setJournalId] = useState('')
  const [query, setQuery] = useState('')
  const [abstractFilter, setAbstractFilter] = useState<AbstractFilter>('all')
  const [error, setError] = useState<string | null>(null)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const requestedPage = useRef(0)
  const pageRef = useRef<HTMLDivElement>(null)
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
    async (targetPage: number): Promise<void> => {
      const seq = ++requestSeq.current
      requestedPage.current = targetPage
      setLoading(true)
      setError(null)
      // 保留已展示的列表和分页布局，等最新请求成功后一次替换，避免清空引起闪烁。
      try {
        const list = await window.tjm.listPapers({
          journalId: journalId || undefined,
          abstractFilter,
          query: debouncedQuery.trim() || undefined,
          // 多读一条判断是否有下一页，避免整页刚好 10 篇时出现空白尾页。
          limit: PAGE_SIZE + 1,
          offset: targetPage * PAGE_SIZE
        })
        if (seq !== requestSeq.current) return
        // 只保留当前页，翻页不会累计论文对象或 DOM 节点。
        setPapers(list.slice(0, PAGE_SIZE))
        setHasMore(list.length > PAGE_SIZE)
        setPageIndex(targetPage)
        pageRef.current?.closest('main')?.scrollTo({ top: 0, behavior: 'instant' })
      } catch (e) {
        if (seq === requestSeq.current) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (seq === requestSeq.current) setLoading(false)
      }
    },
    [journalId, debouncedQuery, abstractFilter]
  )

  useEffect(() => {
    const requests = requestSeq
    void load(0)
    return () => {
      requests.current++
    }
  }, [load])

  return (
    <div ref={pageRef} className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-heading">论文库</h2>
        <div className="flex-1" />
        <select
          aria-label="按期刊筛选"
          value={journalId}
          onChange={(e) => setJournalId(e.target.value)}
          className="min-w-0 max-w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-body outline-none focus:border-primary sm:max-w-80"
        >
          <option value="">全部期刊</option>
          {journals.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
        <div
          role="group"
          aria-label="摘要筛选"
          className="inline-flex shrink-0 rounded-lg border border-border-strong bg-surface p-1"
        >
          {(
            [
              ['all', '全部'],
              ['with', '有摘要'],
              ['without', '没摘要']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={abstractFilter === value}
              onClick={() => setAbstractFilter(value)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${abstractFilter === value ? 'bg-primary-soft text-primary-strong' : 'text-muted hover:bg-subtle'}`}
            >
              {label}
            </button>
          ))}
        </div>
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

      {error && (
        <p role="alert" className="text-sm text-danger-text">
          加载失败：{error}
          {papers.length > 0 && '（仍显示上次加载的结果）'}
          <button
            onClick={() => load(requestedPage.current)}
            className="ml-2 text-primary hover:underline"
          >
            重试
          </button>
        </p>
      )}
      <div aria-busy={loading} aria-label="论文列表" className="space-y-3">
        {papers.map((p) => (
          <PaperCard key={p.id} paper={p} />
        ))}
        {papers.length === 0 && !loading && !error && (
          <p className="py-10 text-center text-sm text-faint">
            {journalId || debouncedQuery.trim() || abstractFilter !== 'all'
              ? '没有符合筛选条件的论文，试试调整筛选或搜索关键词'
              : '暂无论文，请先在仪表盘抓取期刊'}
          </p>
        )}
      </div>

      {loading && papers.length === 0 && (
        <p role="status" className="py-4 text-center text-sm text-faint">
          加载中…
        </p>
      )}
      <nav aria-label="论文分页" className="flex flex-wrap items-center justify-center gap-4">
        <button
          onClick={() => load(pageIndex - 1)}
          disabled={pageIndex === 0 || loading || !!error || query !== debouncedQuery}
          className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-body hover:bg-subtle disabled:cursor-not-allowed disabled:text-faint"
        >
          上一页
        </button>
        <span className="text-sm text-muted">
          第 {pageIndex + 1} 页 · 每页 {PAGE_SIZE} 篇
        </span>
        <button
          onClick={() => load(pageIndex + 1)}
          disabled={!hasMore || loading || !!error || query !== debouncedQuery}
          className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-body hover:bg-subtle disabled:cursor-not-allowed disabled:text-faint"
        >
          下一页
        </button>
      </nav>
    </div>
  )
}

export default PapersPage
