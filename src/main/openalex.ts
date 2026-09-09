import type { NewPaper } from './db'

export interface IssueRef {
  volume: string | null
  issue: string | null
  year: number | null
}

export interface IssuePapers {
  issue: IssueRef
  papers: NewPaper[]
}

interface RawWork {
  id: string
  display_name?: string | null
  title?: string | null
  doi?: string | null
  publication_date?: string | null
  biblio?: { volume?: string | null; issue?: string | null } | null
  abstract_inverted_index?: Record<string, number[]> | null
  authorships?: { author?: { display_name?: string | null } | null }[] | null
  cited_by_count?: number | null
}

const API_BASE = 'https://api.openalex.org/works'
const NO_ISSUE_KEY = '__no_issue__'
const NO_ISSUE_MAX_PAPERS = 200
const MIN_REQUEST_INTERVAL_MS = 120
const MAX_RETRIES = 3

let lastRequestAt = 0

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(url: string): Promise<unknown> {
  const elapsed = Date.now() - lastRequestAt
  if (elapsed < MIN_REQUEST_INTERVAL_MS) await sleep(MIN_REQUEST_INTERVAL_MS - elapsed)
  for (let attempt = 0; ; attempt++) {
    lastRequestAt = Date.now()
    const res = await fetch(url)
    if (res.ok) return res.json()
    if (res.status === 429 || res.status >= 500) {
      if (attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** (attempt + 1))
        continue
      }
      if (res.status === 429) {
        let hint = ''
        try {
          const body = (await res.json()) as { retryAfter?: number }
          if (body.retryAfter) {
            const resetAt = new Date(Date.now() + body.retryAfter * 1000)
            hint = `（配额已用尽，预计 ${resetAt.toLocaleString('zh-CN')} 重置）`
          }
        } catch {
          // 忽略解析失败
        }
        throw new Error(`OpenAlex 请求频率超限: HTTP 429 ${hint}`)
      }
    }
    throw new Error(`OpenAlex 请求失败: HTTP ${res.status}`)
  }
}

function restoreAbstract(index: Record<string, number[]>): string {
  const words: string[] = []
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) words[pos] = word
  }
  return words.filter(Boolean).join(' ')
}

function parseYear(date: string | null | undefined): number | null {
  const m = /^(\d{4})/.exec(date ?? '')
  return m ? Number(m[1]) : null
}

function toNewPaper(work: RawWork): NewPaper {
  const abstract = work.abstract_inverted_index
    ? restoreAbstract(work.abstract_inverted_index) || null
    : null
  return {
    id: work.id.split('/').pop() ?? work.id,
    title: work.display_name ?? work.title ?? '',
    abstract,
    doi: work.doi ?? null,
    authors: (work.authorships ?? [])
      .slice(0, 5)
      .map((a) => a.author?.display_name ?? '')
      .filter(Boolean)
      .join(', '),
    publicationDate: work.publication_date ?? null,
    citedByCount: work.cited_by_count ?? 0
  }
}

export async function fetchRecentIssues(
  sourceIdOrIssn: { openalexSourceId: string | null; issn: string | null },
  maxIssues: number,
  mailto: string
): Promise<IssuePapers[]> {
  const filter = sourceIdOrIssn.openalexSourceId
    ? `primary_location.source.id:https://openalex.org/${sourceIdOrIssn.openalexSourceId}`
    : sourceIdOrIssn.issn
      ? `locations.source.issn:${sourceIdOrIssn.issn}`
      : null
  if (!filter) throw new Error('期刊缺少 OpenAlex source id 与 ISSN，无法抓取')

  const groups = new Map<string, { issue: IssueRef; papers: NewPaper[]; latest: string }>()
  let cursor = '*'

  for (;;) {
    const params = new URLSearchParams({
      filter,
      sort: 'publication_date:desc',
      'per-page': '200',
      cursor
    })
    if (mailto) params.set('mailto', mailto)
    const data = (await fetchJson(`${API_BASE}?${params.toString()}`)) as {
      results?: RawWork[]
      meta?: { next_cursor?: string | null }
    }
    const results = data.results ?? []
    if (results.length === 0) break

    let stop = false
    for (const work of results) {
      const volume = work.biblio?.volume || null
      const issue = work.biblio?.issue || null
      const key = volume === null && issue === null ? NO_ISSUE_KEY : `${volume ?? ''}|${issue ?? ''}`
      let group = groups.get(key)
      if (!group) {
        if (key !== NO_ISSUE_KEY && groups.size >= maxIssues) {
          stop = true
          break
        }
        group = { issue: { volume, issue, year: parseYear(work.publication_date) }, papers: [], latest: '' }
        groups.set(key, group)
      }
      if (key !== NO_ISSUE_KEY || group.papers.length < NO_ISSUE_MAX_PAPERS) {
        group.papers.push(toNewPaper(work))
      }
      const date = work.publication_date ?? ''
      if (date > group.latest) {
        group.latest = date
        group.issue.year = parseYear(work.publication_date) ?? group.issue.year
      }
    }
    if (stop) break
    const next = data.meta?.next_cursor
    if (!next || next === cursor) break
    cursor = next
  }

  return [...groups.values()]
    .sort((a, b) => b.latest.localeCompare(a.latest))
    .slice(0, maxIssues)
    .map(({ issue, papers }) => ({ issue, papers }))
}
