import { describe, expect, it } from 'vitest'
import { restoreAbstract, parseYear } from './openalex'

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
