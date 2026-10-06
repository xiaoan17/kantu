import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import {
  initDatabase,
  seedJournals,
  listJournals,
  listPapers,
  setJournalPreference,
  upsertIssuePapers,
  getFetchSummary,
  getPapersMissingEmbeddings,
  getEmbeddingsWithMeta,
  saveEmbeddings
} from '../src/main/db'
import type { JournalPreference } from '../src/shared/contract'

const path = process.argv[2]
const legacy = new Database(path)
legacy.exec(`CREATE TABLE journals (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, issn TEXT, openalex_source_id TEXT,
  impact_factor REAL, jcr_quartile TEXT, cas_major TEXT, cas_minor TEXT,
  fetch_status TEXT NOT NULL DEFAULT 'pending', last_fetched_at TEXT
);
-- 老库的 papers 表没有 is_retracted，用来验证补列迁移
CREATE TABLE papers (
  id TEXT PRIMARY KEY, journal_id TEXT NOT NULL, volume TEXT, issue TEXT,
  publication_date TEXT, title TEXT NOT NULL, abstract TEXT, doi TEXT,
  authors TEXT NOT NULL DEFAULT '', cited_by_count INTEGER NOT NULL DEFAULT 0,
  embedding BLOB
);
INSERT INTO journals (id, name) VALUES ('a', 'Legacy journal');`)
legacy.close()
initDatabase(path)
assert.equal(listJournals()[0].preference, 'normal')

// ── 老库 papers 表应补出 is_retracted，且索引要能在补列之后建起来 ──
const migrated = new Database(path, { readonly: true })
const paperCols = migrated.prepare('PRAGMA table_info(papers)').all() as { name: string }[]
const retractedIndex = migrated
  .prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type = 'index' AND name = 'idx_papers_retracted'`
  )
  .get() as { ok: number } | undefined
migrated.close()
assert.ok(
  paperCols.some((c) => c.name === 'is_retracted'),
  '老库 papers 表应补出 is_retracted 列'
)
assert.ok(retractedIndex, '补列后应能建出 idx_papers_retracted 索引')
const seeds = ['a', 'b'].map((id) => ({
  id,
  name: id,
  issn: null,
  openalexSourceId: null,
  impactFactor: null,
  jcrQuartile: null,
  casMajor: null,
  casMinor: null
}))
seedJournals(seeds)
for (const preference of ['followed', 'reduced', 'blocked', 'normal', 'followed'] as const) {
  setJournalPreference('a', preference)
  assert.equal(listJournals().find((j) => j.id === 'a')?.preference, preference)
}
assert.throws(() => setJournalPreference('a', 'invalid' as JournalPreference))
assert.throws(() => setJournalPreference('missing', 'blocked'))
seedJournals(seeds)
initDatabase(path)
assert.equal(listJournals().find((j) => j.id === 'a')?.preference, 'followed')
const abstracts = [null, '', ' \n\t\r　\u00a0', 'traffic abstract', 'second traffic abstract']
for (const id of ['a', 'b']) {
  upsertIssuePapers(
    id,
    { volume: null, issue: null, year: null },
    abstracts.map((abstract, i) => ({
      id: `${id}${i}`,
      title: `Traffic ${i}`,
      abstract,
      doi: null,
      authors: '',
      publicationDate: '2026-10-06',
      citedByCount: 0
    }))
  )
}
assert.equal(listPapers({ abstractFilter: 'all' }).length, 10)
assert.equal(listPapers({ abstractFilter: 'with' }).length, 4)
assert.equal(listPapers({ abstractFilter: 'without' }).length, 6)
assert.equal(getFetchSummary().papersWithAbstract, 4)
assert.deepEqual(
  listPapers({ journalId: 'a', query: 'Traffic', abstractFilter: 'without' }).map((p) => p.id),
  ['a0', 'a1', 'a2']
)
assert.deepEqual(
  listPapers({ journalId: 'a', query: 'second', abstractFilter: 'with' }).map((p) => p.id),
  ['a4']
)
assert.equal(listPapers({ query: 'second', abstractFilter: 'without' }).length, 0)
assert.deepEqual(
  listPapers({ abstractFilter: 'with', limit: 2, offset: 0 }).map((p) => p.id),
  ['a3', 'a4']
)
assert.deepEqual(
  listPapers({ abstractFilter: 'with', limit: 2, offset: 2 }).map((p) => p.id),
  ['b3', 'b4']
)
assert.equal(listPapers({ abstractFilter: 'with', limit: 2, offset: 4 }).length, 0)

// ── 撤稿：单向标记，并排除出推荐语料与向量化待办 ──
const retractedPaper = {
  id: 'ret1',
  title: 'Retracted traffic study',
  abstract: 'an abstract that would otherwise be embedded',
  doi: null,
  authors: 'Zhang San',
  publicationDate: '2026-10-06',
  citedByCount: 0,
  isRetracted: true
}
upsertIssuePapers('a', { volume: null, issue: null, year: null }, [retractedPaper])
assert.equal(listPapers({ query: 'Retracted traffic study' })[0].isRetracted, true)
// 有摘要、没向量，但因为是撤稿，不该进向量化待办
assert.ok(
  !getPapersMissingEmbeddings(500).some((p) => p.id === 'ret1'),
  '撤稿论文不应进入向量化待办'
)
// 再抓一次报未撤稿，不能抹掉已有标记
upsertIssuePapers('a', { volume: null, issue: null, year: null }, [
  { ...retractedPaper, isRetracted: false }
])
assert.equal(
  listPapers({ query: 'Retracted traffic study' })[0].isRetracted,
  true,
  '撤稿标记应为单向，后续 false 不能覆盖'
)
assert.equal(getFetchSummary().papersRetracted, 1)
// 即便已经算好向量，也必须被排除出推荐语料（a3 作为未撤稿对照组）
saveEmbeddings([
  { id: 'ret1', vector: [1, 0, 0] },
  { id: 'a3', vector: [0, 1, 0] }
])
assert.ok(
  !getEmbeddingsWithMeta().some((r) => r.paperId === 'ret1'),
  '撤稿论文不应出现在推荐语料中'
)
assert.ok(
  getEmbeddingsWithMeta().some((r) => r.paperId === 'a3'),
  '未撤稿的有向量论文应仍在推荐语料中'
)
console.log('Database integration checks passed')
