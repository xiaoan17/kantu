import Database from 'better-sqlite3'
import type { FetchSummary, JournalMeta, Paper, PapersQuery } from '../shared/contract'
import { escapeLike } from './utils'

export interface JournalSeedEntry {
  id: string
  name: string
  issn: string | null
  openalexSourceId: string | null
  impactFactor: number | null
  jcrQuartile: string | null
  casMajor: string | null
  casMinor: string | null
}

export interface NewPaper {
  id: string
  title: string
  abstract: string | null
  doi: string | null
  authors: string
  publicationDate: string | null
  citedByCount: number
}

interface JournalRow {
  id: string
  name: string
  issn: string | null
  openalex_source_id: string | null
  impact_factor: number | null
  jcr_quartile: string | null
  cas_major: string | null
  cas_minor: string | null
  fetch_status: JournalMeta['fetchStatus']
  last_fetched_at: string | null
  paper_count: number
}

interface PaperRow {
  id: string
  journal_id: string
  volume: string | null
  issue: string | null
  publication_date: string | null
  title: string
  abstract: string | null
  doi: string | null
  authors: string
  cited_by_count: number
  has_embedding: number
}

let db: Database.Database | null = null
let fetchRunning = false

function getDb(): Database.Database {
  if (!db) throw new Error('数据库未初始化，请先调用 initDatabase')
  return db
}

function toJournalMeta(row: JournalRow): JournalMeta {
  return {
    id: row.id,
    name: row.name,
    issn: row.issn,
    openalexSourceId: row.openalex_source_id,
    impactFactor: row.impact_factor,
    jcrQuartile: row.jcr_quartile,
    casMajor: row.cas_major,
    casMinor: row.cas_minor,
    fetchStatus: row.fetch_status,
    lastFetchedAt: row.last_fetched_at,
    paperCount: row.paper_count
  }
}

function toPaper(row: PaperRow): Paper {
  return {
    id: row.id,
    journalId: row.journal_id,
    volume: row.volume,
    issue: row.issue,
    publicationDate: row.publication_date,
    title: row.title,
    abstract: row.abstract,
    doi: row.doi,
    authors: row.authors,
    citedByCount: row.cited_by_count,
    hasEmbedding: row.has_embedding === 1
  }
}

const JOURNAL_SELECT = `
  SELECT j.*, (SELECT COUNT(*) FROM papers p WHERE p.journal_id = j.id) AS paper_count
  FROM journals j
`

export function initDatabase(dbPath: string): void {
  db = new Database(dbPath)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS journals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      issn TEXT,
      openalex_source_id TEXT,
      impact_factor REAL,
      jcr_quartile TEXT,
      cas_major TEXT,
      cas_minor TEXT,
      fetch_status TEXT NOT NULL DEFAULT 'pending',
      last_fetched_at TEXT
    );

    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      journal_id TEXT NOT NULL REFERENCES journals(id),
      volume TEXT,
      issue TEXT,
      publication_date TEXT,
      title TEXT NOT NULL,
      abstract TEXT,
      doi TEXT,
      authors TEXT NOT NULL DEFAULT '',
      cited_by_count INTEGER NOT NULL DEFAULT 0,
      embedding BLOB
    );

    CREATE INDEX IF NOT EXISTS idx_papers_journal ON papers (journal_id);
    CREATE INDEX IF NOT EXISTS idx_papers_missing_embedding
      ON papers (journal_id) WHERE embedding IS NULL;
  `)
}

export function seedJournals(seed: JournalSeedEntry[]): void {
  const stmt = getDb().prepare(`
    INSERT INTO journals (id, name, issn, openalex_source_id, impact_factor, jcr_quartile, cas_major, cas_minor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      issn = excluded.issn,
      openalex_source_id = excluded.openalex_source_id,
      impact_factor = excluded.impact_factor,
      jcr_quartile = excluded.jcr_quartile,
      cas_major = excluded.cas_major,
      cas_minor = excluded.cas_minor
  `)
  getDb().transaction((entries: JournalSeedEntry[]): void => {
    for (const e of entries) {
      stmt.run(e.id, e.name, e.issn, e.openalexSourceId, e.impactFactor, e.jcrQuartile, e.casMajor, e.casMinor)
    }
  })(seed)
}

export function listJournals(): JournalMeta[] {
  const rows = getDb().prepare(`${JOURNAL_SELECT} ORDER BY j.name`).all() as JournalRow[]
  return rows.map(toJournalMeta)
}

export function getJournal(id: string): JournalMeta | undefined {
  const row = getDb().prepare(`${JOURNAL_SELECT} WHERE j.id = ?`).get(id) as JournalRow | undefined
  return row ? toJournalMeta(row) : undefined
}

export function listJournalsToFetch(ids?: string[]): JournalMeta[] {
  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(', ')
    const rows = getDb()
      .prepare(`${JOURNAL_SELECT} WHERE j.id IN (${placeholders}) ORDER BY j.name`)
      .all(...ids) as JournalRow[]
    return rows.map(toJournalMeta)
  }
  const rows = getDb()
    .prepare(`${JOURNAL_SELECT} WHERE j.issn IS NOT NULL ORDER BY j.name`)
    .all() as JournalRow[]
  return rows.map(toJournalMeta)
}

export function setJournalFetchStatus(
  id: string,
  status: 'pending' | 'fetching' | 'done' | 'error'
): void {
  if (status === 'done') {
    getDb()
      .prepare(`UPDATE journals SET fetch_status = ?, last_fetched_at = ? WHERE id = ?`)
      .run(status, new Date().toISOString(), id)
  } else {
    getDb().prepare(`UPDATE journals SET fetch_status = ? WHERE id = ?`).run(status, id)
  }
}

export function listPapers(q: PapersQuery): Paper[] {
  const where: string[] = []
  const params: unknown[] = []
  if (q.journalId) {
    where.push('journal_id = ?')
    params.push(q.journalId)
  }
  if (q.query) {
    where.push(`(title LIKE ? ESCAPE '\\' OR abstract LIKE ? ESCAPE '\\')`)
    const pattern = `%${escapeLike(q.query)}%`
    params.push(pattern, pattern)
  }
  const limit = q.limit ?? 100
  const offset = q.offset ?? 0
  const sql = `
    SELECT id, journal_id, volume, issue, publication_date, title, abstract, doi, authors,
           cited_by_count, embedding IS NOT NULL AS has_embedding
    FROM papers
    ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY publication_date DESC
    LIMIT ? OFFSET ?
  `
  const rows = getDb().prepare(sql).all(...params, limit, offset) as PaperRow[]
  return rows.map(toPaper)
}

export function upsertIssuePapers(
  journalId: string,
  issue: { volume: string | null; issue: string | null; year: number | null },
  papers: NewPaper[]
): void {
  const database = getDb()
  const upsertPaper = database.prepare(`
    INSERT INTO papers (id, journal_id, volume, issue, publication_date, title, abstract, doi, authors, cited_by_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      journal_id = excluded.journal_id,
      volume = excluded.volume,
      issue = excluded.issue,
      publication_date = excluded.publication_date,
      title = excluded.title,
      abstract = excluded.abstract,
      doi = excluded.doi,
      authors = excluded.authors,
      cited_by_count = excluded.cited_by_count
  `)
  database.transaction((items: NewPaper[]): void => {
    for (const p of items) {
      upsertPaper.run(
        p.id,
        journalId,
        issue.volume,
        issue.issue,
        p.publicationDate,
        p.title,
        p.abstract,
        p.doi,
        p.authors,
        p.citedByCount
      )
    }
  })(papers)
}

export function getFetchSummary(): FetchSummary {
  const j = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN fetch_status = 'done' THEN 1 ELSE 0 END), 0) AS done
       FROM journals`
    )
    .get() as { total: number; done: number }
  const p = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN abstract IS NOT NULL AND abstract != '' THEN 1 ELSE 0 END), 0) AS with_abstract,
              COALESCE(SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END), 0) AS with_embedding
       FROM papers`
    )
    .get() as { total: number; with_abstract: number; with_embedding: number }
  return {
    totalJournals: j.total,
    doneJournals: j.done,
    totalPapers: p.total,
    papersWithAbstract: p.with_abstract,
    papersWithEmbedding: p.with_embedding,
    running: fetchRunning
  }
}

export function setFetchRunning(running: boolean): void {
  fetchRunning = running
}

export function isFetchRunning(): boolean {
  return fetchRunning
}

export function getPapersMissingEmbeddings(
  limit: number
): { id: string; title: string; abstract: string }[] {
  return getDb()
    .prepare(
      `SELECT id, title, abstract FROM papers
       WHERE embedding IS NULL AND abstract IS NOT NULL AND abstract != ''
       ORDER BY publication_date DESC
       LIMIT ?`
    )
    .all(limit) as { id: string; title: string; abstract: string }[]
}

export function saveEmbeddings(rows: { id: string; vector: number[] }[]): void {
  const stmt = getDb().prepare(`UPDATE papers SET embedding = ? WHERE id = ?`)
  getDb().transaction((items: { id: string; vector: number[] }[]): void => {
    for (const row of items) {
      const buffer = Buffer.from(new Float32Array(row.vector).buffer)
      stmt.run(buffer, row.id)
    }
  })(rows)
}

export function clearEmbeddings(): void {
  getDb().prepare(`UPDATE papers SET embedding = NULL`).run()
}

export function getEmbeddingsWithMeta(): {
  paperId: string
  journalId: string
  title: string
  publicationDate: string | null
  doi: string | null
  vector: Float32Array
}[] {
  const rows = getDb()
    .prepare(
      `SELECT id, journal_id, title, publication_date, doi, embedding FROM papers
       WHERE embedding IS NOT NULL AND abstract IS NOT NULL AND abstract != ''`
    )
    .all() as {
    id: string
    journal_id: string
    title: string
    publication_date: string | null
    doi: string | null
    embedding: Buffer
  }[]
  return rows.map((row) => ({
    paperId: row.id,
    journalId: row.journal_id,
    title: row.title,
    publicationDate: row.publication_date,
    doi: row.doi,
    vector:
      row.embedding.byteOffset % 4 === 0
        ? new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4)
        : new Float32Array(
            row.embedding.buffer.slice(
              row.embedding.byteOffset,
              row.embedding.byteOffset + row.embedding.byteLength
            )
          )
  }))
}
