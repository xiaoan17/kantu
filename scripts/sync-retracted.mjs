#!/usr/bin/env node
/**
 * 把 OpenAlex 的 `is_retracted` 同步进本地库，供推荐语料排除与论文库打标。
 *
 * 为什么不能靠标题：撤稿后标题是否被加上 "RETRACTED:" 前缀由出版商决定，
 * 库里 48 条带前缀，但撤稿原文更多是不带任何标记、看起来完全正常的论文。
 * OpenAlex 的 is_retracted 才是权威字段。
 *
 * 标记是**单向**的（只置 1，不清零）：撤稿是既成事实，OpenAlex 偶发返回
 * false 不该让一篇已撤稿论文悄悄回到推荐里。
 *
 * 用法：
 *   node scripts/sync-retracted.mjs            # dry-run，只报告
 *   node scripts/sync-retracted.mjs --apply    # 写回数据库
 *
 * 参数：
 *   --apply            写回；缺省只报告
 *   --db <path>        指定 tjm.db 路径
 *   --mailto <email>   走 OpenAlex 礼貌池
 *   --no-cache         忽略缓存强制重查
 *   --limit <n>        只扫描前 n 篇（调试用）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

const API = 'https://api.openalex.org/works'
// OpenAlex 的 openalex_id OR 过滤上限就是 100，实测 100 个 id 能全部返回
const BATCH = 100
const DELAY_MS = 120
const CACHE_DIR = join(__dirname, '.prune')
const CACHE_FILE = join(CACHE_DIR, 'retracted-scan.json')

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = process.argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}

const APPLY = process.argv.includes('--apply')
const NO_CACHE = process.argv.includes('--no-cache')
const MAILTO = arg('mailto', '')
const LIMIT = Number(arg('limit', 0)) || 0
const DB_PATH =
  arg('db') ||
  process.env.TJM_DB ||
  join(homedir(), 'Library', 'Application Support', 'transport-journal-match', 'tjm.db')

if (!existsSync(DB_PATH)) {
  console.error(`找不到数据库：${DB_PATH}`)
  process.exit(1)
}

const Database = require('better-sqlite3')
const db = new Database(DB_PATH, { readonly: !APPLY })
db.pragma('busy_timeout = 10000')

const rows = db.prepare(`SELECT id, title, is_retracted FROM papers ORDER BY id`).all()
const targets = LIMIT ? rows.slice(0, LIMIT) : rows

console.log(`数据库：${DB_PATH}`)
console.log(
  `待扫描 ${targets.length} 篇（库内已有标记 ${rows.filter((r) => r.is_retracted).length} 篇）\n`
)

let cache = {}
if (!NO_CACHE && existsSync(CACHE_FILE)) {
  try {
    cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
  } catch {
    cache = {}
  }
}

const need = targets.map((r) => r.id).filter((id) => !(id in cache))
console.log(
  `缓存命中 ${targets.length - need.length} 篇，需查询 ${need.length} 篇（约 ${Math.ceil(need.length / BATCH)} 次请求）`
)

async function fetchBatch(ids) {
  const params = new URLSearchParams({
    filter: `openalex_id:${ids.join('|')}`,
    select: 'id,is_retracted',
    'per-page': String(BATCH)
  })
  if (MAILTO) params.set('mailto', MAILTO)
  const url = `${API}?${params.toString()}`
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'kantu-retraction-sync/1.0' } })
    if (res.status === 429) {
      const wait = 2000 * (attempt + 1)
      console.log(`  429 限流，等 ${wait}ms 后重试`)
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
    cache[id] = { retracted: w.is_retracted === true }
  }
  for (const id of ids) if (!seen.has(id)) cache[id] = { retracted: false, unresolved: true }
  process.stdout.write(`\r  已查询 ${Math.min(i + BATCH, need.length)}/${need.length}`)
  await new Promise((r) => setTimeout(r, DELAY_MS))
}
process.stdout.write('\n')

if (!NO_CACHE && need.length) {
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(CACHE_FILE, JSON.stringify(cache))
}

// ── 汇总 ───────────────────────────────────────────────────
const flaggedInApi = targets.filter((r) => cache[r.id]?.retracted === true)
const unresolved = targets.filter((r) => cache[r.id]?.unresolved)
const toMark = flaggedInApi.filter((r) => !r.is_retracted)
const alreadyMarked = flaggedInApi.filter((r) => r.is_retracted)
// 库内已标撤稿、但 OpenAlex 现在说没有：只报告，不自动清零
const staleMarked = targets.filter((r) => r.is_retracted && cache[r.id]?.retracted === false)

console.log('\n── 扫描结果 ──')
console.log(`  OpenAlex 标记撤稿        ${flaggedInApi.length}`)
console.log(`    其中库内尚未标记       ${toMark.length}`)
console.log(`    其中库内已标记         ${alreadyMarked.length}`)
console.log(`  OpenAlex 查不到该 id     ${unresolved.length}`)
console.log(`  库内已标记但 API 说未撤稿 ${staleMarked.length}`)

if (toMark.length) {
  console.log('\n  本次将新标记的撤稿论文（前 15 条）：')
  for (const r of toMark.slice(0, 15)) console.log(`    · ${r.title.slice(0, 72)}`)
}
if (staleMarked.length) {
  console.log('\n  库内已标记、API 说未撤稿（保留标记，仅提示）：')
  for (const r of staleMarked.slice(0, 5)) console.log(`    · ${r.title.slice(0, 72)}`)
}

mkdirSync(CACHE_DIR, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const reportFile = join(CACHE_DIR, `retracted-report-${stamp}.json`)
writeFileSync(
  reportFile,
  JSON.stringify({ db: DB_PATH, toMark, alreadyMarked, staleMarked, unresolved }, null, 2)
)
console.log(`\n报告已写入：${reportFile}`)

if (!APPLY) {
  console.log('\n[dry-run] 未改动数据库。确认后执行：')
  console.log('  node scripts/sync-retracted.mjs --apply\n')
  db.close()
  process.exit(0)
}

if (toMark.length === 0) {
  console.log('\n没有需要新标记的论文。')
  db.close()
  process.exit(0)
}

const update = db.prepare('UPDATE papers SET is_retracted = 1 WHERE id = ?')
const run = db.transaction((items) => {
  let n = 0
  for (const item of items) n += update.run(item.id).changes
  return n
})
const marked = run(toMark)

const totals = db
  .prepare(
    `SELECT count(*) AS total,
            sum(CASE WHEN is_retracted = 1 THEN 1 ELSE 0 END) AS retracted,
            sum(CASE WHEN embedding IS NOT NULL
                      AND abstract IS NOT NULL AND trim(abstract) <> ''
                      AND is_retracted = 0 THEN 1 ELSE 0 END) AS corpus
     FROM papers`
  )
  .get()
console.log(`\n已标记 ${marked} 篇为撤稿`)
console.log(`当前库：总数 ${totals.total}，撤稿 ${totals.retracted}，推荐语料 ${totals.corpus} 篇`)
db.close()
