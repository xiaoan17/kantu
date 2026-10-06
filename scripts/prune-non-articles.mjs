#!/usr/bin/env node
/**
 * 清理库里「结构性无摘要」的非正文条目（封面页、编委会、目录、社论、更正、撤稿等）。
 *
 * 判定依据是 OpenAlex 的权威字段 `type`，不是标题正则：
 *   保留 = article | review
 *   移除 = paratext / editorial / erratum / retraction / letter / peer-review ...
 * 这批历史行是早期抓取时漏进来的——现在 fetcher 已有 `type:article|review` 过滤，
 * 但库里存量行不会自己消失。
 *
 * 用法：
 *   node scripts/prune-non-articles.mjs              # dry-run，只出分布报告
 *   node scripts/prune-non-articles.mjs --apply      # 真正删除（先自动导出可回滚的 JSON）
 *
 * 参数：
 *   --apply              执行删除；缺省只报告
 *   --scope missing      只扫描缺摘要的论文（默认，正是「结构性无摘要」那一拨）
 *   --scope all          扫描全库（会对每篇论文查一次 OpenAlex，较慢）
 *   --db <path>          指定 tjm.db 路径
 *   --mailto <email>     走 OpenAlex 礼貌池，抓取更稳
 *   --keep-letter        保留 letter（通讯/评论），只删 parquet/erratum 等硬非正文
 *   --no-cache           忽略本地 type 缓存，强制重查
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

const API = 'https://api.openalex.org/works'
const BATCH = 50
const CACHE_DIR = join(__dirname, '.prune')
const CACHE_FILE = join(CACHE_DIR, 'types.json')

const KEEP_TYPES = new Set(['article', 'review'])

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = process.argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}

const APPLY = process.argv.includes('--apply')
const NO_CACHE = process.argv.includes('--no-cache')
const SCOPE = arg('scope', 'missing')
const MAILTO = arg('mailto', '')
const DB_PATH =
  arg('db') ||
  process.env.TJM_DB ||
  join(homedir(), 'Library', 'Application Support', 'transport-journal-match', 'tjm.db')

const KEEP_OVERRIDE = process.argv.includes('--keep-letter')
  ? new Set([...KEEP_TYPES, 'letter'])
  : KEEP_TYPES

if (!existsSync(DB_PATH)) {
  console.error(`找不到数据库：${DB_PATH}`)
  process.exit(1)
}

const Database = require('better-sqlite3')
const db = new Database(DB_PATH, { readonly: !APPLY })
db.pragma('busy_timeout = 10000')

// ── 1. 选出候选行 ──────────────────────────────────────────
const scopeWhere = SCOPE === 'all' ? '' : "(abstract IS NULL OR trim(abstract) = '')"
const rows = db
  .prepare(
    `SELECT id, journal_id, title, doi, abstract, volume, issue, publication_date,
            authors, cited_by_count
     FROM papers ${scopeWhere ? `WHERE ${scopeWhere}` : ''}`
  )
  .all()

console.log(`数据库：${DB_PATH}`)
console.log(`扫描范围：${SCOPE === 'all' ? '全库' : '缺摘要论文'}，候选 ${rows.length} 条\n`)

// ── 2. 查 OpenAlex type（带本地缓存，避免重复烧配额）────────
let cache = {}
if (!NO_CACHE && existsSync(CACHE_FILE)) {
  try {
    cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
  } catch {
    cache = {}
  }
}

const need = rows.map((r) => r.id).filter((id) => id && !(id in cache))
console.log(`type 缓存命中 ${rows.length - need.length} 条，需查询 ${need.length} 条`)

async function fetchBatch(ids) {
  const params = new URLSearchParams({
    filter: `openalex_id:${ids.join('|')}`,
    select: 'id,type,type_crossref,title',
    'per-page': String(BATCH)
  })
  if (MAILTO) params.set('mailto', MAILTO)
  const url = `${API}?${params.toString()}`
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'kantu-prune/1.0' } })
    if (res.status === 429) {
      const wait = 2000 * (attempt + 1)
      console.log(`  429 限流，等 ${wait}ms 重试`)
      await new Promise((r) => setTimeout(r, wait))
      continue
    }
    if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`)
    const data = await res.json()
    return data.results ?? []
  }
  throw new Error('OpenAlex 连续限流')
}

for (let i = 0; i < need.length; i += BATCH) {
  const ids = need.slice(i, i + BATCH)
  const results = await fetchBatch(ids)
  const seen = new Set()
  for (const w of results) {
    const id = w.id?.split('/').pop()
    if (!id) continue
    seen.add(id)
    cache[id] = { type: w.type ?? null, crossref: w.type_crossref ?? null }
  }
  // 查不到的（合并/撤下）显式记为 unresolved，别当成缺失反复重查
  for (const id of ids) if (!seen.has(id)) cache[id] = { type: 'unresolved', crossref: null }
  const done = Math.min(i + BATCH, need.length)
  process.stdout.write(`\r  已查询 ${done}/${need.length}`)
  await new Promise((r) => setTimeout(r, 120))
}
process.stdout.write('\n')

if (!NO_CACHE && need.length) {
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 0))
}

// ── 3. 分类：三条互补规则，命中原因逐条留痕 ────────────────
//   R1 OpenAlex type 非正文（硬信号）
//   R2 type 说正文，但作者与摘要双空 —— IEEE 杂志后置物 / 索引页 / 通告
//   R3 JST 机翻记录（OpenAlex 标成 article，但只是他国论文的翻译壳）
const byType = new Map()
const toRemove = []
const unresolved = []
const ruleCount = new Map()

function mark(row, type, rule) {
  ruleCount.set(rule, (ruleCount.get(rule) ?? 0) + 1)
  toRemove.push({ ...row, type, rule })
}

for (const row of rows) {
  const meta = cache[row.id]
  const type = meta?.type ?? 'unknown'
  if (!byType.has(type)) byType.set(type, [])
  byType.get(type).push(row)

  if (type === 'unresolved' || type === 'unknown') {
    unresolved.push(row)
    continue
  }

  const noAuthors = !(row.authors ?? '').trim()
  const noAbstract = !(row.abstract ?? '').trim()

  if (!KEEP_OVERRIDE.has(type)) {
    mark(row, type, `R1:type=${type}`)
  } else if (noAuthors && noAbstract) {
    mark(row, type, 'R2:无作者无摘要')
  } else if (/【JST/.test(row.title)) {
    mark(row, type, 'R3:JST机翻')
  }
}

console.log('\n── type 分布 ──')
for (const [type, list] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const label =
    type === 'unresolved' || type === 'unknown'
      ? '保留（无法判定）'
      : KEEP_OVERRIDE.has(type)
        ? '保留'
        : '移除'
  console.log(`  ${String(list.length).padStart(5)}  ${type.padEnd(14)} → ${label}`)
}

// ── 4. 命中规则明细，逐条可审 ──────────────────────────────
console.log('\n── 命中规则 ──')
for (const [rule, n] of [...ruleCount.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${rule}`)
  const samples = toRemove.filter((r) => r.rule === rule).slice(0, 3)
  for (const s of samples) console.log(`         · ${s.title.slice(0, 66)}`)
}
console.log(`  ${'—'.padStart(5)}  合计移除 ${toRemove.length} 条`)

if (unresolved.length) {
  console.log(`\n  无法判定（保留不动）：${unresolved.length} 条`)
  for (const r of unresolved.slice(0, 5)) console.log(`    ${r.title.slice(0, 70)}`)
}

// ── 5. 落盘 / 执行 ─────────────────────────────────────────
mkdirSync(CACHE_DIR, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const planFile = join(CACHE_DIR, `plan-${stamp}.json`)
writeFileSync(planFile, JSON.stringify({ db: DB_PATH, scope: SCOPE, toRemove }, null, 2))
console.log(`\n清单已写入：${planFile}`)

if (!APPLY) {
  console.log(`\n[dry-run] 未改动数据库。确认无误后执行：`)
  console.log(`  node scripts/prune-non-articles.mjs --scope ${SCOPE} --apply\n`)
  db.close()
  process.exit(0)
}

if (toRemove.length === 0) {
  console.log('\n没有需要移除的条目。')
  db.close()
  process.exit(0)
}

// 删除前导出完整行，保证可回滚
const removedFile = join(CACHE_DIR, `removed-${stamp}.json`)
writeFileSync(removedFile, JSON.stringify(toRemove, null, 2))

// 顺手备份一份数据库（用 sqlite 的 backup，WAL 下也安全）
// 注意 db.backup() 返回 Promise：必须 await，否则备份没写完就开始删。
const bakFile = `${DB_PATH}.before-prune-${stamp}`
try {
  await db.backup(bakFile)
  console.log(`数据库备份：${bakFile}`)
} catch (err) {
  console.error(`备份失败，中止删除：${err.message}`)
  process.exit(1)
}

// 校验备份可用且行数一致，否则宁可不删
try {
  const check = new Database(bakFile, { readonly: true })
  const integrity = check.pragma('quick_check', { simple: true })
  const srcCount = db.prepare('SELECT count(*) c FROM papers').get().c
  const bakCount = check.prepare('SELECT count(*) c FROM papers').get().c
  check.close()
  if (integrity !== 'ok' || srcCount !== bakCount) {
    throw new Error(`完整性=${integrity}，源 ${srcCount} 行 vs 备份 ${bakCount} 行`)
  }
  console.log(`备份校验通过：quick_check=ok，papers ${bakCount} 行`)
} catch (err) {
  console.error(`备份校验失败，中止删除：${err.message}`)
  process.exit(1)
}

db.pragma('foreign_keys = ON')
const del = db.prepare('DELETE FROM papers WHERE id = ?')
const run = db.transaction((items) => {
  let n = 0
  for (const item of items) n += del.run(item.id).changes
  return n
})
const deleted = run(toRemove)

console.log(`\n已删除 ${deleted} 条`)
console.log(`移除明细（可回滚）：${removedFile}`)

const after = db
  .prepare(
    `SELECT count(*) total,
            sum(CASE WHEN abstract IS NOT NULL AND trim(abstract) <> '' THEN 1 ELSE 0 END) with_abs
     FROM papers`
  )
  .get()
console.log(
  `删除后：总数 ${after.total}，有摘要 ${after.with_abs}，缺摘要 ${after.total - after.with_abs}`
)
db.close()
