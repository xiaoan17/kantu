// 摘要回填脚本：为数据库中缺少摘要的论文，从出版商页面抓取摘要。
// 支持：
//   Elsevier（10.1016）：DOI → linkinghub 跳转拿 PII → ScienceDirect 页面 __PRELOADED_STATE__
//   Springer Nature（10.1007 / 10.1057）：link.springer.com 页面的 dc.description meta
// IEEE / T&F / ASCE 有严格反爬，暂未支持。摘要本身公开可读，但请保持低速抓取（默认间隔 3 秒）。
//
// 用法：
//   node scripts/backfill-abstracts.mjs [--db <路径>] [--delay <毫秒>] [--limit <条数>]
//   nohup node scripts/backfill-abstracts.mjs > /tmp/backfill.log 2>&1 &
//
// 可断点续跑：只处理 abstract 仍为 NULL 的论文；页面确认无摘要的 DOI 记入
// scripts/.backfill-no-abstract.json，后续运行自动跳过。

import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import Database from 'better-sqlite3'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NO_ABSTRACT_PATH = join(ROOT, 'scripts', '.backfill-no-abstract.json')

const args = process.argv.slice(2)
function argValue(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const DB_PATH =
  argValue('db', null) ??
  join(homedir(), 'Library', 'Application Support', 'transport-journal-match', 'tjm.db')
const DELAY_MS = Number(argValue('delay', 3000))
const LIMIT = Number(argValue('limit', 0)) // 0 = 全部
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const MAX_CONSECUTIVE_FAILURES = 8

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function resolvePii(doi) {
  const res = await fetch(`https://doi.org/${doi}`, {
    redirect: 'manual',
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(20000)
  })
  const location = res.headers.get('location') ?? ''
  const m = /\/pii\/([^?&#]+)/.exec(location)
  return m ? m[1] : null
}

async function fetchAbstractFromScienceDirect(pii) {
  const res = await fetch(`https://www.sciencedirect.com/science/article/pii/${pii}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30000)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  return extractAbstract(html)
}

// Springer Nature（10.1007 / 10.1057）：摘要就在页面的 dc.description meta 标签里
async function fetchAbstractFromSpringer(doi) {
  const res = await fetch(`https://link.springer.com/article/${doi}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30000)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const m = /<meta\s+name="dc\.description"\s+content="([^"]+)"/i.exec(html)
  if (!m) {
    // 正常文章页 100KB+；太小说明是拦截页，按失败处理以便重试
    if (html.length < 20000) throw new Error('页面无效（疑似拦截页）')
    return null
  }
  const text = decodeEntities(m[1]).trim()
  return text.length >= 50 ? text : null
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

// 按 DOI 前缀分发到对应出版商；不支持的前缀返回 undefined（调用方跳过）
async function fetchAbstract(doi) {
  if (doi.startsWith('10.1016/')) {
    const pii = await resolvePii(doi)
    if (!pii) throw new Error('无法从 DOI 跳转解析 PII')
    await sleep(DELAY_MS / 2)
    return await fetchAbstractFromScienceDirect(pii)
  }
  if (doi.startsWith('10.1007/') || doi.startsWith('10.1057/')) {
    return await fetchAbstractFromSpringer(doi)
  }
  return undefined
}

// 从 __PRELOADED_STATE__ JSON 中提取摘要正文（abstracts.content 下的 simple-para 文本）。
// 返回 string = 抓到摘要；null = 页面正常但确无摘要；抛出异常 = 页面无效（反爬挑战页等），应重试。
function extractAbstract(html) {
  const marker = 'window.__PRELOADED_STATE__ = '
  const start = html.indexOf(marker)
  // 正常文章页约 160KB+ 且含 __PRELOADED_STATE__；缺失说明拿到的是挑战页/拦截页
  if (start < 0) throw new Error('页面无效（疑似反爬挑战页）')
  const jsonStart = start + marker.length
  // 平衡括号扫描出完整 JSON 对象
  let depth = 0
  let end = -1
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end < 0) throw new Error('页面 JSON 不完整')
  let state
  try {
    state = JSON.parse(html.slice(jsonStart, end))
  } catch {
    throw new Error('页面 JSON 解析失败')
  }
  const content = state?.abstracts?.content
  if (!Array.isArray(content)) return null
  // 段落结构因期刊而异：有的是 simple-para 节点直接带 _ 文本，
  // 有的拆成 __text__/italic 等内联碎片。统一深度优先收集 section-title 以外的所有 _ 文本。
  const fragments = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (node['#name'] === 'section-title') return
    if (typeof node._ === 'string') fragments.push(node._)
    if (Array.isArray(node.$$)) node.$$.forEach(walk)
  }
  content.forEach((section) => {
    const children = section?.$$
    if (!Array.isArray(children)) return
    // 跳过 Highlights / Keywords 等非摘要小节（无 section-title 的小节照常收录）
    const title = (children.find((c) => c?.['#name'] === 'section-title')?._ ?? '').toLowerCase()
    if (/highlight|keyword/.test(title)) return
    children.forEach(walk)
  })
  const text = fragments
    .join('')
    .replace(/^Abstract[:\s]+/i, '')
    .trim()
  return text.length >= 50 ? text : null
}

async function loadNoAbstractSet() {
  try {
    return new Set(JSON.parse(await readFile(NO_ABSTRACT_PATH, 'utf8')))
  } catch {
    return new Set()
  }
}

async function main() {
  const noAbstract = await loadNoAbstractSet()
  const db = new Database(DB_PATH)
  db.pragma('busy_timeout = 5000')
  const update = db.prepare('UPDATE papers SET abstract = ? WHERE id = ?')

  const rows = db
    .prepare(
      `SELECT id, doi, title FROM papers
       WHERE abstract IS NULL AND (
         doi LIKE '%10.1016/%' OR doi LIKE '%10.1007/%' OR doi LIKE '%10.1057/%'
       )
       ORDER BY publication_date DESC`
    )
    .all()
    .filter((r) => {
      const doi = r.doi.replace('https://doi.org/', '')
      return !noAbstract.has(doi)
    })

  const targets = LIMIT > 0 ? rows.slice(0, LIMIT) : rows
  console.log(
    `[backfill] 待处理 ${targets.length} 篇（另跳过已确认无摘要 ${noAbstract.size} 篇），间隔 ${DELAY_MS}ms`
  )

  let ok = 0
  let empty = 0
  let failed = 0
  let consecutiveFailures = 0
  const tx = db.transaction((id, abstract) => update.run(abstract, id))

  for (let i = 0; i < targets.length; i++) {
    const { id, doi, title } = targets[i]
    const shortDoi = doi.replace('https://doi.org/', '')
    try {
      const abstract = await fetchAbstract(shortDoi)
      if (abstract) {
        tx(id, abstract)
        ok++
        consecutiveFailures = 0
      } else {
        // 页面正常但确实没有摘要（更正声明、短篇等），记录下来以后跳过
        empty++
        consecutiveFailures = 0
        noAbstract.add(shortDoi)
      }
    } catch (err) {
      failed++
      consecutiveFailures++
      console.log(`[backfill] 失败 ${shortDoi}《${title.slice(0, 40)}》: ${err.message}`)
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log('[backfill] 连续失败过多，可能触发反爬，终止。稍后重跑即可续传。')
        break
      }
      await sleep(DELAY_MS * 3)
    }
    if ((i + 1) % 25 === 0 || i === targets.length - 1) {
      console.log(
        `[backfill] 进度 ${i + 1}/${targets.length}，成功 ${ok}，无摘要 ${empty}，失败 ${failed}`
      )
      await writeFile(NO_ABSTRACT_PATH, JSON.stringify([...noAbstract]))
    }
    await sleep(DELAY_MS)
  }

  await writeFile(NO_ABSTRACT_PATH, JSON.stringify([...noAbstract]))
  console.log(`[backfill] 完成：成功 ${ok}，确认无摘要 ${empty}，失败 ${failed}`)
}

main().catch((err) => {
  console.error('[backfill] 异常终止:', err)
  process.exit(1)
})
