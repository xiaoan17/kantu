import { describe, expect, it } from 'vitest'
import { restoreAbstract, parseYear, isNonArticle } from './openalex'

describe('restoreAbstract', () => {
  it('按位置还原倒排索引', () => {
    expect(restoreAbstract({ world: [1], Hello: [0] })).toBe('Hello world')
  })

  it('同一词出现多次', () => {
    expect(restoreAbstract({ the: [0, 2], cat: [1], mat: [3] })).toBe('the cat the mat')
  })

  it('位置有空洞时跳过空位', () => {
    expect(restoreAbstract({ a: [0], b: [5] })).toBe('a b')
  })

  it('空索引返回空串', () => {
    expect(restoreAbstract({})).toBe('')
  })
})

describe('parseYear', () => {
  it('解析 ISO 日期开头的年份', () => {
    expect(parseYear('2024-05-01')).toBe(2024)
  })

  it('null / undefined / 非日期返回 null', () => {
    expect(parseYear(null)).toBeNull()
    expect(parseYear(undefined)).toBeNull()
    expect(parseYear('abc')).toBeNull()
  })
})

describe('isNonArticle', () => {
  const authors = [{ author: { display_name: 'Zhang San' } }]

  it('无作者且无摘要判为非正文（IEEE 杂志填充页）', () => {
    expect(isNonArticle({ id: 'W1', display_name: 'IEEE App' })).toBe(true)
    expect(isNonArticle({ id: 'W2', display_name: '2025 Index IEEE Transactions' })).toBe(true)
  })

  it('有作者但暂时没摘要仍是正文，保留等回填', () => {
    expect(
      isNonArticle({ id: 'W4', display_name: 'New Elsevier paper', authorships: authors })
    ).toBe(false)
  })

  it('JST 机翻记录即便有作者也剔除', () => {
    expect(
      isNonArticle({
        id: 'W5',
        display_name: '交通渋滞予測【JST・京大機械翻訳】',
        authorships: authors
      })
    ).toBe(true)
  })

  it('正常论文保留（有作者有摘要）', () => {
    expect(
      isNonArticle({
        id: 'W6',
        display_name: 'Traffic flow prediction',
        authorships: authors,
        abstract_inverted_index: { a: [0] }
      })
    ).toBe(false)
  })

  it('只有摘要没作者时不算非正文，避免误杀', () => {
    expect(
      isNonArticle({ id: 'W3', display_name: 'Some paper', abstract_inverted_index: { a: [0] } })
    ).toBe(false)
  })

  it('authorships 存在但作者名为空时按无作者处理', () => {
    expect(isNonArticle({ id: 'W7', display_name: 'Editorial Board', authorships: [{}] })).toBe(
      true
    )
  })
})
