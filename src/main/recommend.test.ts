import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JournalMeta, JournalPreference } from '../shared/contract'
import { getEmbeddingsWithMeta, listJournals } from './db'
import { embedTexts } from './embed'
import { recommend } from './recommend'

vi.mock('./db', () => ({ getEmbeddingsWithMeta: vi.fn(), listJournals: vi.fn() }))
vi.mock('./embed', () => ({ embedTexts: vi.fn() }))

const journal = (id: string, preference: JournalPreference, quartile = 'Q1'): JournalMeta => ({
  id,
  name: id,
  preference,
  issn: null,
  openalexSourceId: null,
  impactFactor: null,
  jcrQuartile: quartile,
  casMajor: '工程技术(1区)',
  casMinor: null,
  fetchStatus: 'done',
  lastFetchedAt: null,
  paperCount: 10
})

function corpus(journals: JournalMeta[], scores: number[]): void {
  vi.mocked(listJournals).mockReturnValue(journals)
  vi.mocked(getEmbeddingsWithMeta).mockReturnValue(
    journals.flatMap((j, idx) =>
      Array.from({ length: 10 }, (_, i) => ({
        paperId: `${j.id}-${i}`,
        journalId: j.id,
        title: 'Transport',
        publicationDate: null,
        doi: null,
        vector: new Float32Array([scores[idx], Math.sqrt(1 - scores[idx] ** 2)])
      }))
    )
  )
}
const input = { title: 'Transport', abstract: 'Traffic prediction' }
beforeEach(() => {
  vi.mocked(embedTexts).mockResolvedValue([[1, 0]])
})

describe('推荐偏好', () => {
  it('关注提升、降权降低排序，同时保留原始语义得分和证据', async () => {
    corpus(
      [
        journal('normal', 'normal'),
        journal('followed', 'followed'),
        journal('reduced', 'reduced'),
        journal('blocked', 'blocked')
      ],
      [0.8, 0.78, 0.82, 1]
    )
    const results = await recommend(input)
    expect(results.map((r) => r.journal.id)).toEqual(['followed', 'normal', 'reduced'])
    expect(results[0].score).toBeCloseTo(0.78)
    expect(results[0].rankingScore).toBeCloseTo(0.83)
    expect(results[0].evidence).toHaveLength(3)
    expect(results[0].evidence[0].similarity).toBeCloseTo(0.78)
  })
  it('关注不能覆盖分区筛选或显著的语义差距', async () => {
    corpus(
      [
        journal('normal', 'normal'),
        journal('followed', 'followed'),
        journal('q2', 'followed', 'Q2')
      ],
      [0.9, 0.6, 1]
    )
    const results = await recommend({ ...input, filters: { jcrQuartiles: ['Q1'] } })
    expect(results.map((r) => r.journal.id)).toEqual(['normal', 'followed'])
  })
  it('全部拉黑返回空结果，恢复正常后重新参与推荐', async () => {
    corpus([journal('one', 'blocked')], [1])
    expect(await recommend(input)).toEqual([])
    corpus([journal('one', 'normal')], [1])
    expect(await recommend(input)).toHaveLength(1)
  })
})
