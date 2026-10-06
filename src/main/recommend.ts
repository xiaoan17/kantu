import { getEmbeddingsWithMeta, listJournals } from './db'
import { embedTexts } from './embed'
import { cosine, casZone } from './utils'
import { JOURNAL_PREFERENCES } from '../shared/contract'
import type {
  EvidencePaper,
  JournalMeta,
  JournalRecommendation,
  RecommendInput
} from '../shared/contract'

const TOP_N_FOR_SCORE = 10
const TOP_N_EVIDENCE = 3

function passesFilters(journal: JournalMeta, input: RecommendInput): boolean {
  if (journal.preference === 'blocked') return false
  const filters = input.filters
  if (!filters) return true
  if (filters.jcrQuartiles && filters.jcrQuartiles.length > 0) {
    if (!journal.jcrQuartile || !filters.jcrQuartiles.includes(journal.jcrQuartile)) {
      return false
    }
  }
  if (filters.casZoneMax != null) {
    // 无法解析分区（含无分区数据）的期刊视为不满足分区上限条件
    const zone = casZone(journal.casMajor)
    if (zone === null || zone > filters.casZoneMax) return false
  }
  return true
}

export async function recommend(input: RecommendInput): Promise<JournalRecommendation[]> {
  const rows = getEmbeddingsWithMeta()
  if (rows.length === 0) {
    throw new Error('语料库尚未生成向量，请先在期刊页抓取数据并运行向量化')
  }
  const [queryVec] = await embedTexts([`${input.title}\n\n${input.abstract}`])

  let skipped = 0
  const byJournal = new Map<string, Array<{ row: (typeof rows)[number]; sim: number }>>()
  for (const row of rows) {
    if (row.vector.length !== queryVec.length) {
      skipped++
      continue
    }
    const sim = cosine(queryVec, row.vector)
    const list = byJournal.get(row.journalId)
    if (list) {
      list.push({ row, sim })
    } else {
      byJournal.set(row.journalId, [{ row, sim }])
    }
  }

  if (byJournal.size === 0) {
    throw new Error(
      `所有语料向量（${skipped} 条）与当前 Embedding 模型维度不一致，请检查设置页的模型配置后重新向量化`
    )
  }

  const journals = new Map<string, JournalMeta>(listJournals().map((j: JournalMeta) => [j.id, j]))
  const results: JournalRecommendation[] = []
  for (const [journalId, items] of byJournal) {
    const journal = journals.get(journalId)
    if (!journal || !passesFilters(journal, input)) continue
    items.sort((a, b) => b.sim - a.sim)
    const top = items.slice(0, TOP_N_FOR_SCORE)
    // 固定分母：语料不足 10 篇的期刊按缺失计 0，避免单篇高相似的小样本期刊冲顶
    const score = top.reduce((sum, it) => sum + it.sim, 0) / TOP_N_FOR_SCORE
    const evidence: EvidencePaper[] = items.slice(0, TOP_N_EVIDENCE).map((it) => ({
      paperId: it.row.paperId,
      title: it.row.title,
      publicationDate: it.row.publicationDate,
      doi: it.row.doi,
      similarity: it.sim
    }))
    const rankingScore = score + JOURNAL_PREFERENCES[journal.preference].adjustment
    results.push({ journal, score, rankingScore, evidence })
  }
  results.sort(
    (a, b) =>
      b.rankingScore - a.rankingScore ||
      b.score - a.score ||
      a.journal.id.localeCompare(b.journal.id)
  )
  return results
}
