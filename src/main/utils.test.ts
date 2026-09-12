import { describe, expect, it } from 'vitest'
import { cosine, casZone, escapeLike } from './utils'

describe('cosine', () => {
  it('相同向量相似度为 1', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
  })

  it('正交向量相似度为 0', () => {
    expect(cosine([1, 0], [0, 1])).toBe(0)
  })

  it('反向向量相似度为 -1', () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1)
  })

  it('零向量返回 0 而不是 NaN', () => {
    expect(cosine([0, 0], [1, 2])).toBe(0)
  })

  it('支持 Float32Array 输入', () => {
    expect(cosine(new Float32Array([1, 2]), [1, 2])).toBeCloseTo(1)
  })
})

describe('casZone', () => {
  it('解析半角括号', () => {
    expect(casZone('工程技术(1区)')).toBe(1)
  })

  it('解析全角括号', () => {
    expect(casZone('工程技术（2区）')).toBe(2)
  })

  it('混合括号与空格', () => {
    expect(casZone('工程技术( 3 区）')).toBe(3)
  })

  it('null 与无分区字符串返回 null', () => {
    expect(casZone(null)).toBeNull()
    expect(casZone('工程技术')).toBeNull()
  })
})

describe('escapeLike', () => {
  it('转义 % _ 和反斜杠', () => {
    expect(escapeLike('50%_x\\y')).toBe('50\\%\\_x\\\\y')
  })

  it('普通字符串原样返回', () => {
    expect(escapeLike('traffic flow')).toBe('traffic flow')
  })
})
