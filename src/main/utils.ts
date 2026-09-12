/** 纯函数工具：不依赖 electron / 数据库，可直接单元测试。 */

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** 从中科院大区字符串（如 '工程技术(1区)' / '工程技术（2区）'）解析分区号。 */
export function casZone(casMajor: string | null): number | null {
  if (!casMajor) return null
  const m = casMajor.match(/[（(]\s*(\d+)\s*区[)）]/)
  return m ? Number(m[1]) : null
}

/** 转义 SQL LIKE 模式中的通配符，配合 ESCAPE '\' 使用。 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`)
}
