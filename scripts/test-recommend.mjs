// recommend/embed 离线测试：stub electron + mock embedding API + 真实 SQLite
import { createRequire } from 'module'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
const app = createRequire(import.meta.url)('./.rec-bundle.cjs')

let failures = 0
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`)
  if (!cond) failures++
}

// 1) 准备 settings（stub 的 userData = /tmp/tjm-userdata）
mkdirSync('/tmp/tjm-userdata', { recursive: true })
writeFileSync(
  '/tmp/tjm-userdata/settings.json',
  JSON.stringify({
    embeddingBaseUrl: 'https://api.test.local/v1',
    embeddingApiKey: 'sk-test',
    embeddingModel: 'test-embedding',
    mailto: ''
  })
)

// 2) 建库：期刊 A（Q1，IEEE 智能交通）与期刊 B（Q3），各 3 篇带向量的论文
rmSync('/tmp/tjm-test2.db', { force: true })
app.initDatabase('/tmp/tjm-test2.db')
app.seedJournals([
  {
    id: 'journal-a',
    name: 'Journal A ITS',
    issn: '1111-1111',
    openalexSourceId: 'S1',
    impactFactor: 8.4,
    jcrQuartile: 'Q1',
    casMajor: '计算机科学(1区)',
    casMinor: null
  },
  {
    id: 'journal-b',
    name: 'Journal B General',
    issn: '2222-2222',
    openalexSourceId: 'S2',
    impactFactor: 2.0,
    jcrQuartile: 'Q3',
    casMajor: '工程技术(3区)',
    casMinor: null
  }
])

// 查询向量 [1,0]：期刊 A 的论文与它高度相似，期刊 B 的正交
app.upsertIssuePapers('journal-a', { volume: '1', issue: '1', year: 2026 }, [
  {
    id: 'WA1',
    title: 'traffic signal control',
    abstract: 'rl for signals',
    doi: null,
    authors: 'A',
    publicationDate: '2026-01-01',
    citedByCount: 0
  },
  {
    id: 'WA2',
    title: 'its paper 2',
    abstract: 'more traffic',
    doi: null,
    authors: 'B',
    publicationDate: '2026-01-02',
    citedByCount: 0
  },
  {
    id: 'WA3',
    title: 'its paper 3',
    abstract: 'even more',
    doi: null,
    authors: 'C',
    publicationDate: '2026-01-03',
    citedByCount: 0
  }
])
app.upsertIssuePapers('journal-b', { volume: '1', issue: '1', year: 2026 }, [
  {
    id: 'WB1',
    title: 'unrelated 1',
    abstract: 'other stuff',
    doi: null,
    authors: 'D',
    publicationDate: '2026-01-01',
    citedByCount: 0
  },
  {
    id: 'WB2',
    title: 'unrelated 2',
    abstract: 'other stuff',
    doi: null,
    authors: 'E',
    publicationDate: '2026-01-02',
    citedByCount: 0
  }
])
app.saveEmbeddings([
  { id: 'WA1', vector: [1, 0] },
  { id: 'WA2', vector: [0.98, 0.02] },
  { id: 'WA3', vector: [0.95, 0.05] },
  { id: 'WB1', vector: [0, 1] },
  { id: 'WB2', vector: [0.1, 0.99] }
])

// 3) mock embedding API：无论输入什么都返回查询向量 [1,0]
let apiCalled = 0
globalThis.fetch = async (url, opts) => {
  apiCalled++
  const body = JSON.parse(opts.body)
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: body.input.map(() => ({ embedding: [1, 0] })) })
  }
}

// 4) 推荐
const recs = await app.recommend({ title: 'my traffic paper', abstract: 'about signal control' })
check('embedding API 被调用', apiCalled === 1)
check('返回 2 本期刊', recs.length === 2)
check('期刊 A 排第一', recs[0].journal.id === 'journal-a')
check('期刊 A 得分接近 1', recs[0].score > 0.97)
check('期刊 B 得分明显更低', recs[1].score < 0.2)
check(
  '证据论文 Top-3 且按相似度降序',
  recs[0].evidence.length === 3 && recs[0].evidence[0].paperId === 'WA1'
)
check('期刊元数据随结果返回', recs[0].journal.impactFactor === 8.4)

// 5) 过滤器：JCR 只要 Q3 → 只剩期刊 B
const filtered = await app.recommend({
  title: 'x',
  abstract: 'y',
  filters: { jcrQuartiles: ['Q3'] }
})
check('JCR 过滤后只剩期刊 B', filtered.length === 1 && filtered[0].journal.id === 'journal-b')

// 中科院大区上限 2 区 → A(1区) 留，B(3区) 去
const casFiltered = await app.recommend({ title: 'x', abstract: 'y', filters: { casZoneMax: 2 } })
check(
  '中科院 ≤2区 过滤后只剩期刊 A',
  casFiltered.length === 1 && casFiltered[0].journal.id === 'journal-a'
)

// 6) runEmbeddingForPending：全部已有向量时应直接返回（不发请求）
const before = apiCalled
let progressed = false
await app.runEmbeddingForPending(() => {
  progressed = true
})
check('无待向量化时不请求 API', apiCalled === before && !progressed)

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
