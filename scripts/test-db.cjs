// 数据层集成测试：用 esbuild 打包 db.ts 后跑真实 SQLite
const { readFileSync, rmSync } = require('fs')

const db = require('./.db-bundle.cjs')
const seed = JSON.parse(readFileSync('./resources/journals.seed.json', 'utf-8'))

const DB_PATH = '/tmp/tjm-test.db'
rmSync(DB_PATH, { force: true })

let failures = 0
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`)
  if (!cond) failures++
}

db.initDatabase(DB_PATH)
db.seedJournals(seed)
const journals = db.listJournals()
check('seed 后期刊数 = 73', journals.length === 73)
check('期刊带 ISSN', journals.every((j) => j.issn && j.openalexSourceId))

const trc = db.getJournal('transportation-research-part-c')
check('可按 id 取 TR-C', trc?.name === 'Transportation Research Part C')
check('TR-C 初始状态 pending', trc?.fetchStatus === 'pending')

// 幂等：改状态后再 seed，不应被重置
db.setJournalFetchStatus('transportation-research-part-c', 'done')
db.seedJournals(seed)
check('重复 seed 不覆盖 fetchStatus', db.getJournal('transportation-research-part-c').fetchStatus === 'done')

// 插入 2 个 issue 共 5 篇论文（1 篇无摘要）
const papers = Array.from({ length: 5 }, (_, i) => ({
  id: `W${1000 + i}`,
  title: `Traffic study ${i}`,
  abstract: i === 4 ? null : `Abstract of traffic study ${i} about congestion and control`,
  doi: `10.1/test.${i}`,
  authors: 'Alice, Bob',
  publicationDate: '2026-08-01',
  citedByCount: i
}))
db.upsertIssuePapers('transportation-research-part-c', { volume: '194', issue: '1', year: 2026 }, papers.slice(0, 3))
db.upsertIssuePapers('transportation-research-part-c', { volume: '193', issue: '12', year: 2026 }, papers.slice(3))

const listed = db.listPapers({ journalId: 'transportation-research-part-c' })
check('论文插入 5 篇', listed.length === 5)
check('paperCount 实时统计', db.getJournal('transportation-research-part-c').paperCount === 5)

const searched = db.listPapers({ query: 'study 2' })
check('模糊搜索命中', searched.length === 1 && searched[0].title === 'Traffic study 2')

// 幂等 upsert：重复插入不翻倍
db.upsertIssuePapers('transportation-research-part-c', { volume: '194', issue: '1', year: 2026 }, papers.slice(0, 3))
check('重复 upsert 不重复计数', db.getJournal('transportation-research-part-c').paperCount === 5)

const missing = db.getPapersMissingEmbeddings(10)
check('待向量化 = 4（跳过无摘要）', missing.length === 4)

db.saveEmbeddings(missing.map((p) => ({ id: p.id, vector: [0.1, 0.2, 0.3] })))
check('向量化后待处理 = 0', db.getPapersMissingEmbeddings(10).length === 0)

const embs = db.getEmbeddingsWithMeta()
check('向量读出 4 条且维度正确', embs.length === 4 && embs[0].vector.length === 3 && Math.abs(embs[0].vector[0] - 0.1) < 1e-6)

db.setFetchRunning(true)
const summary = db.getFetchSummary()
check('summary 统计正确', summary.totalJournals === 73 && summary.doneJournals === 1 && summary.totalPapers === 5 && summary.papersWithAbstract === 4 && summary.papersWithEmbedding === 4 && summary.running === true)
db.setFetchRunning(false)

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
