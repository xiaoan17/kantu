import { useEffect, useState } from 'react'
import { ExternalLink, AlertTriangle } from 'lucide-react'
import type { JournalMeta, JournalRecommendation } from '../../../shared/contract'
import Spinner from '../components/Spinner'

function RecommendPage(): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [abstract, setAbstract] = useState('')
  const [quartileOptions, setQuartileOptions] = useState<string[]>([])
  const [selectedQuartiles, setSelectedQuartiles] = useState<string[]>([])
  const [casZoneMax, setCasZoneMax] = useState<number | null>(null)
  const [results, setResults] = useState<JournalRecommendation[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.tjm.listJournals().then((journals: JournalMeta[]) => {
      const set = new Set<string>()
      journals.forEach((j) => {
        if (j.jcrQuartile) set.add(j.jcrQuartile)
      })
      setQuartileOptions([...set].sort())
    })
  }, [])

  const toggleQuartile = (q: string): void => {
    setSelectedQuartiles((prev) =>
      prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]
    )
  }

  const run = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const list = await window.tjm.runRecommend({
        title: title.trim(),
        abstract: abstract.trim(),
        filters: {
          jcrQuartiles: selectedQuartiles.length > 0 ? selectedQuartiles : undefined,
          casZoneMax
        }
      })
      setResults(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const canRun = title.trim().length > 0 && abstract.trim().length > 0 && !loading

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-slate-800">选刊推荐</h2>

      <div className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">论文题目</label>
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            rows={2}
            placeholder="输入论文题目…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">论文摘要</label>
          <textarea
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
            rows={6}
            placeholder="输入论文摘要…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-6">
          {quartileOptions.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700">JCR 分区：</span>
              {quartileOptions.map((q) => (
                <label key={q} className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={selectedQuartiles.includes(q)}
                    onChange={() => toggleQuartile(q)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  {q}
                </label>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">中科院大区上限：</span>
            <select
              value={casZoneMax ?? ''}
              onChange={(e) => setCasZoneMax(e.target.value === '' ? null : Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
            >
              <option value="">不限</option>
              <option value={1}>1区</option>
              <option value={2}>2区</option>
              <option value={3}>3区</option>
            </select>
          </div>
          <div className="flex-1" />
          <button
            onClick={run}
            disabled={!canRun}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            开始推荐
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <Spinner text="正在计算语义相似度，请稍候…" />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">推荐失败</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      {results && results.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-400">
          没有符合条件的期刊，请放宽筛选条件或先完成抓取与向量化
        </p>
      )}

      {results && results.length > 0 && (
        <div className="space-y-4">
          {results.map((rec, idx) => (
            <div key={rec.journal.id} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                  {idx + 1}
                </span>
                <h3 className="text-base font-semibold text-slate-800">{rec.journal.name}</h3>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  匹配度 {(rec.score * 100).toFixed(1)}%
                </span>
                <div className="flex-1" />
                {rec.journal.impactFactor !== null && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                    IF {rec.journal.impactFactor}
                  </span>
                )}
                {rec.journal.jcrQuartile && (
                  <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                    JCR {rec.journal.jcrQuartile}
                  </span>
                )}
                {rec.journal.casMajor && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    中科院 {rec.journal.casMajor}
                  </span>
                )}
              </div>
              {rec.evidence.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    相似证据论文
                  </p>
                  {rec.evidence.map((ev) => {
                    const doiUrl = ev.doi
                      ? ev.doi.startsWith('http')
                        ? ev.doi
                        : `https://doi.org/${ev.doi}`
                      : null
                    return (
                      <div key={ev.paperId} className="flex items-center gap-3 text-sm">
                        <span className="w-14 shrink-0 text-right text-xs font-medium text-emerald-600">
                          {(ev.similarity * 100).toFixed(1)}%
                        </span>
                        <span className="flex-1 truncate text-slate-700">{ev.title}</span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {ev.publicationDate ?? ''}
                        </span>
                        {doiUrl && (
                          <a
                            href={doiUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex shrink-0 items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            DOI <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default RecommendPage
