// 摘要回填（浏览器路线）：用 ego-browser 打开出版商的文章页，从页面元数据 / 摘要区里抓取摘要。
//
// 为什么需要浏览器：Elsevier / IEEE / T&F 等出版商对普通 HTTP 抓取做了反爬，
// Node 的 fetch 拿不到正文；而真实的 Ego Lite 浏览器带着完整 JS 环境和用户会话，
// 页面能正常渲染，摘要也就可读。
//
// 支持情况（实测）：
//   10.1007 / 10.1057 / 10.1186  Springer / SpringerOpen  → meta[name=dc.description]
//   10.1109                      IEEE Xplore              → meta[property=og:description]
//   10.1080                      Taylor & Francis         → div.hlFld-Abstract
//   10.1061                      ASCE Library             → section[role=doc-abstract]
//   10.1002 / 10.1155            Wiley / Hindawi          → 同上的元数据回退链
//   其他                         通用回退链
//   10.1016                      Elsevier ScienceDirect   → 目前被人机验证拦截，默认跳过（--include-elsevier 可强试）
//
// 用法：
//   node scripts/browser-backfill.mjs plan                 # 只看待办清单
//   node scripts/browser-backfill.mjs run                  # 开始回填（可随时 Ctrl-C，重跑自动续传）
//   node scripts/browser-backfill.mjs run --limit 50        # 只跑 50 篇
//   node scripts/browser-backfill.mjs apply                 # 只把已抓到的结果写回数据库
//
// 结果与状态都在 scripts/.browser-backfill/ 下：
//   queue.json      待办清单（首次 plan 时生成）
//   results.jsonl   每行一条抓取结果，抓一条写一条，中断不丢
//   no-abstract.json  确认页面没有摘要的 DOI，重跑时跳过

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'

// better-sqlite3 是原生模块，只有本机（要读写数据库）才装得起。
// 远端机器只负责抓取、不碰数据库，所以这里延迟到真正要用时才加载。
const require = createRequire(import.meta.url)
function openDb(readonly = false) {
  const Database = require('better-sqlite3')
  return readonly ? new Database(DB_PATH, { readonly: true }) : new Database(DB_PATH)
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STATE_DIR = join(ROOT, 'scripts', '.browser-backfill')
const QUEUE_PATH = join(STATE_DIR, 'queue.json')
const RESULTS_PATH = join(STATE_DIR, 'results.jsonl')
const NO_ABSTRACT_PATH = join(STATE_DIR, 'no-abstract.json')

const args = process.argv.slice(2)
const command = args[0] ?? 'plan'
function argValue(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
function hasFlag(name) {
  return args.includes(`--${name}`)
}

const DB_PATH =
  argValue('db', null) ??
  join(homedir(), 'Library', 'Application Support', 'transport-journal-match', 'tjm.db')
const BATCH_SIZE = Number(argValue('batch', 20))
const LIMIT = Number(argValue('limit', 0)) // 0 = 不限制
const SPACE_ID = Number(argValue('space', 1))
const PAGE_DELAY_MS = Number(argValue('delay', 500))
const MAX_EMPTY_BATCHES = 3
// 某一批失败率超过这个比例就认为被限流了，歇一会儿再继续
const ERROR_RATE_COOLDOWN = Number(argValue('error-rate', 0.4))
const COOLDOWN_MS = Number(argValue('cooldown', 60000))
const ONLY = (argValue('only', '') || '').split(',').filter(Boolean)
const EXCLUDE = (argValue('exclude', '') || '').split(',').filter(Boolean)
// Elsevier 的摘要只能从机构网络里拿（校外 IP 会 401），所以支持两种跑法：
// 本机跑浏览器，或把任务丢到机构网内的机器上用纯 HTTP 跑（见 README「分发给内网机器」）。
const HTTP_MODE = hasFlag('http') // 用纯 HTTP 直取，不启浏览器
const FETCH_ONLY = hasFlag('fetch-only') // 只抓不写库：远端机器没有数据库
const API_KEY_FILE = argValue('api-key-file', join(STATE_DIR, 'elsevier-key.txt'))

// ---------------------------------------------------------------------------
// 出版商路由
// ---------------------------------------------------------------------------

// 顺序即优先级，先匹配到的生效；other 必须放最后
const PUBLISHERS = [
  {
    key: 'springer',
    match: (doi) => /^10\.(1007|1057|1186|1057)\//.test(doi),
    url: (doi) => `https://link.springer.com/article/${doi}`
  },
  {
    key: 'ieee',
    match: (doi) => /^10\.1109\//.test(doi),
    url: (doi) => `https://doi.org/${doi}`
  },
  {
    key: 'tandf',
    match: (doi) => /^10\.1080\//.test(doi),
    url: (doi) => `https://www.tandfonline.com/doi/full/${doi}`
  },
  {
    key: 'asce',
    match: (doi) => /^10\.1061\//.test(doi),
    url: (doi) => `https://ascelibrary.org/doi/${doi}`
  },
  {
    key: 'wiley',
    match: (doi) => /^10\.(1002|1155)\//.test(doi),
    url: (doi) => `https://onlinelibrary.wiley.com/doi/${doi}`
  },
  {
    key: 'informs',
    match: (doi) => /^10\.1287\//.test(doi),
    url: (doi) => `https://pubsonline.informs.org/doi/${doi}`
  },
  {
    key: 'elsevier',
    match: (doi) => /^10\.1016\//.test(doi),
    url: (doi) => `https://doi.org/${doi}`
  },
  {
    key: 'other',
    match: () => true,
    url: (doi) => `https://doi.org/${doi}`
  }
]

function routeDoi(doi) {
  return PUBLISHERS.find((p) => p.match(doi))
}

// 更正声明、编者按、目录页、期刊前页这类条目本来就没有摘要，不必浪费浏览器请求。
// IEEE 杂志里 [ITS People]、Society Updates、Information for Authors 都属此类。
const JUNK_TITLE =
  /(\bcorrection\b|\bcorrigendum\b|\berratum\b|\bretraction\b|retracted:|\beditorial\b|guest editorial|in memoriam|\bobituary\b|\bpreface\b|\bforeword\b|issue information|table of contents|author index|subject index|call for papers|erratum to|information for authors|instructions for authors|society updates|president'?s message|editorial board|list of reviewers|front cover|back cover|^\s*\d{4} index|vts publications|^\s*\[[^\]]{2,40}\]\s*$)/i

// ---------------------------------------------------------------------------
// 状态文件
// ---------------------------------------------------------------------------

function loadJsonl(path) {
  if (!existsSync(path)) return []
  const out = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      out.push(JSON.parse(t))
    } catch {
      // 中断时可能留下半行，忽略
    }
  }
  return out
}

function loadNoAbstract() {
  try {
    return new Set(JSON.parse(readFileSync(NO_ABSTRACT_PATH, 'utf8')))
  } catch {
    return new Set()
  }
}

function saveNoAbstract(set) {
  writeFileSync(NO_ABSTRACT_PATH, JSON.stringify([...set].sort(), null, 0))
}

// ---------------------------------------------------------------------------
// plan：从数据库生成待办清单
// ---------------------------------------------------------------------------

function buildQueue() {
  const db = openDb(true)
  const rows = db
    .prepare(
      `SELECT id, doi, title, journal_id FROM papers
       WHERE (abstract IS NULL OR trim(abstract) = '')
         AND doi IS NOT NULL AND doi <> ''
       ORDER BY publication_date DESC`
    )
    .all()
  db.close()

  const items = []
  let junk = 0
  for (const row of rows) {
    const doi = row.doi.replace(/^https?:\/\/doi\.org\//, '')
    if (!doi) continue
    if (JUNK_TITLE.test(row.title) || row.title.trim().length < 15) {
      junk++
      continue
    }
    const publisher = routeDoi(doi)
    items.push({
      id: row.id,
      doi,
      title: row.title,
      publisher: publisher.key,
      url: publisher.url(doi)
    })
  }
  return { items, junk, total: rows.length }
}

function loadQueue() {
  if (!existsSync(QUEUE_PATH)) return null
  return JSON.parse(readFileSync(QUEUE_PATH, 'utf8'))
}

// ---------------------------------------------------------------------------
// 浏览器侧：生成交给 ego-browser 执行的脚本
// ---------------------------------------------------------------------------

// 这段函数会在页面里执行，必须自包含（不能引用外部变量）
function extractAbstractInPage(expectTitle) {
  // 导航到 PDF / XML / 纯文本时 document.body 可能是 null，所有读取都要兜底
  const bodyText = document.body ? document.body.innerText || '' : ''
  const norm = (s) =>
    (s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const clean = (raw) => {
    let t = norm(raw)
    if (!t) return null
    // 去掉正文开头重复的 "Abstract" 标题
    t = t.replace(/^(graphical abstract|abstract|摘要)\s*[:：]?\s*/i, '')
    // 有些页面先列 Highlights 再列 Abstract，截到 Abstract 之后
    const head = t.slice(0, 300)
    const m = /\babstract\b\s*[:：]?\s*/i.exec(head)
    if (m && m.index > 0) t = t.slice(m.index + m[0].length)
    return norm(t) || null
  }
  const meta = (name) => {
    const node = document.querySelector(`meta[name="${name}" i], meta[property="${name}" i]`)
    return node ? node.getAttribute('content') : null
  }

  const candidates = []
  for (const key of ['dc.description', 'citation_abstract', 'DCSext.Abstract']) {
    const text = clean(meta(key))
    if (text) candidates.push({ text, source: `meta:${key}` })
  }
  const og = clean(meta('og:description'))
  if (og) candidates.push({ text: og, source: 'meta:og:description' })

  const DOM_SELECTORS = [
    '#Abs1-content',
    'section[data-title="Abstract"]',
    'section[data-title="Abstract"] .c-article-section__content',
    'div.hlFld-Abstract',
    '#abstractId1',
    'section[role="doc-abstract"]',
    '#abstract',
    '#abstracts',
    '.abstractSection',
    'div.abstract',
    '.article-section__abstract',
    '.abstract-content'
  ]
  for (const selector of DOM_SELECTORS) {
    const node = document.querySelector(selector)
    if (!node) continue
    const text = clean(node.innerText)
    if (text) candidates.push({ text, source: `dom:${selector}` })
  }

  // 通用兜底：标题正好是 Abstract 的小节。
  // 新版 Springer / SpringerOpen 用 <h2 class="c-article-section__title">Abstract</h2>，
  // 标题文字必须锚定到 "Abstract"，否则容易把周边栏目的正文误当成摘要。
  for (const heading of document.querySelectorAll('h1, h2, h3, h4, [role="heading"]')) {
    if (!/^abstract[:：]?\s*$/i.test(norm(heading.innerText))) continue
    const section = heading.closest('section, article, div')
    const text = clean(section && section.innerText)
    if (text) candidates.push({ text, source: 'dom:abstract-heading' })
  }

  const twitter = clean(meta('twitter:description'))
  if (twitter) candidates.push({ text: twitter, source: 'meta:twitter:description' })
  const plain = clean(meta('description'))
  if (plain) candidates.push({ text: plain, source: 'meta:description' })

  // 页面正文里常见但绝不是摘要的样板文字
  const BOILERPLATE =
    /^(we use cookies|this website uses cookies|this site uses cookies|skip to main content|your browser|javascript is disabled|cookie settings|we use cookies to)/i

  let best = null
  for (const candidate of candidates) {
    const t = candidate.text
    if (t.length < 200) continue
    if ((t.match(/ /g) || []).length < 25) continue
    if (BOILERPLATE.test(t)) continue
    // 以省略号结尾且不长的，通常是搜索结果里的摘要片段，不是完整摘要
    if (/(\.\.\.|…)$/.test(t) && t.length < 400) continue
    if (!best || t.length > best.text.length) best = { text: t, source: candidate.source }
  }

  // 用"页面里能不能看到这篇论文的标题"判断文章页是否真的渲染出来了。
  // 只靠 body 长度会把没加载完的 SPA 误判成"这篇文章没有摘要"，从此永久跳过。
  const squash = (s) =>
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const probe = squash(expectTitle).slice(0, 60)
  const titleSeen = probe.length >= 20 ? squash(bodyText).includes(probe) : null

  return {
    found: best,
    pageTitle: document.title,
    bodyLen: bodyText.length,
    titleSeen,
    url: location.href,
    blocked:
      /are you a robot|just a moment|client challenge|verify you are human|access denied|enable javascript|人机验证/i.test(
        bodyText.slice(0, 3000)
      )
  }
}

// IEEE 专用快路：走 Xplore 站内 JSON 接口，不渲染页面。
// IEEE 对"连续加载文章页"限流很凶（实测一半批次直接全灭），但站内接口宽松得多：
//   1) POST /rest/search 一次可以用 "doi" OR "doi" ... 换回一批 articleNumber
//   2) GET  /rest/document/{articleNumber}/abstract 拿完整摘要（注意 /rest/search 里的
//      abstract 字段被截断到 403 字符，不能用）
function buildIeeeApiScript(batch) {
  const items = JSON.stringify(batch)
  return `
const task = await taskSpace(${SPACE_ID});
const page = task.page("p1");
const items = ${items};
const SEARCH_CHUNK = 20;

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const records = [];
const results = [];
const byDoi = new Map();
for (const item of items) byDoi.set(norm(item.doi), item);
const resolved = new Map();

await page.goto("https://ieeexplore.ieee.org/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2000);

// 第一步：批量把 DOI 换成 articleNumber
for (let i = 0; i < items.length; i += SEARCH_CHUNK) {
  const chunk = items.slice(i, i + SEARCH_CHUNK);
  try {
    const res = await page.fetch("https://ieeexplore.ieee.org/rest/search", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        queryText: chunk.map((x) => '"' + x.doi + '"').join(" OR "),
        returnType: "SEARCH",
        matchPubs: true,
        rowsPerPage: "25"
      }),
      timeout: 30000
    });
    const body = JSON.parse(typeof res.body === "string" ? res.body : JSON.stringify(res.body));
    for (const rec of body.records || []) {
      if (!rec.doi) continue;
      // 只用返回记录里的 DOI 做键，避免把摘要写到别的论文名下
      const key = norm(rec.doi);
      if (byDoi.has(key) && rec.articleNumber) resolved.set(key, rec.articleNumber);
    }
  } catch (err) {
    // 整块失败，下面会按 empty 处理，下一轮再试
  }
  await page.waitForTimeout(400);
}

// 第二步：逐个取完整摘要
for (const item of items) {
  const record = { id: item.id, doi: item.doi, publisher: item.publisher, url: item.url };
  const startedAt = Date.now();
  const articleNumber = resolved.get(norm(item.doi));
  if (!articleNumber) {
    record.status = "empty";
    record.message = "IEEE 检索未返回该 DOI";
  } else {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await page.fetch(
          "https://ieeexplore.ieee.org/rest/document/" + articleNumber + "/abstract",
          { headers: { accept: "application/json" }, timeout: 25000 }
        );
        const doc = JSON.parse(typeof res.body === "string" ? res.body : JSON.stringify(res.body));
        if (norm(doc.doi) && norm(doc.doi) !== norm(item.doi)) {
          // 拿回来的不是这篇，宁可留空也不要写错
          record.status = "error";
          record.message = "DOI 不匹配: " + doc.doi;
          break;
        }
        const abstract = (doc.abstract || "").replace(/\\s+/g, " ").trim();
        if (abstract.length >= 200) {
          record.status = "ok";
          record.abstract = abstract;
          record.source = "ieee-api:rest/document";
        } else {
          // IEEE 自己就没有摘要（杂志栏目、前页等）
          record.status = "no-abstract";
          record.pageTitle = doc.title || "";
        }
        break;
      } catch (err) {
        record.status = "error";
        record.message = String(err).slice(0, 200);
        if (attempt === 0) await page.waitForTimeout(2500);
      }
    }
  }
  record.ms = Date.now() - startedAt;
  console.log("__RESULT__" + JSON.stringify(record));
  await page.waitForTimeout(${PAGE_DELAY_MS} + Math.floor(Math.random() * 300));
}
`
}

function buildEgoScript(batch) {
  // 整批都是 IEEE 时走站内接口，比逐页导航快得多也不容易被限流
  if (batch.length > 0 && batch.every((item) => item.publisher === 'ieee')) {
    return buildIeeeApiScript(batch)
  }
  const items = JSON.stringify(batch)
  // 把页面侧函数序列化成源码，避免 ego-browser 的跨进程序列化差异
  const extractorSource = extractAbstractInPage.toString()
  return `
const task = await taskSpace(${SPACE_ID});
const page = task.page("p1");
const items = ${items};
${extractorSource}
for (const item of items) {
  const record = { id: item.id, doi: item.doi, publisher: item.publisher, url: item.url };
  const startedAt = Date.now();
  // 导航偶发 ERR_ABORTED / 超时很常见，原地重试一次再记失败
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // 导航有可能"静默失败"：goto 不报错，但页面还停在上一篇上。
      // 那样会把上一篇的摘要写到这篇名下，所以必须确认 URL 真的变了。
      const urlBefore = await page.url();
      await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 40000 });
      let result = await page.evaluate(extractAbstractInPage, item.title);
      // 标题已经出现却还没摘要，多半这类条目本来就没有摘要，只给一次短补等；
      // 标题都还没渲染出来的，说明页面还在加载，多等一会儿。
      const waits = result.titleSeen === true ? [1200] : [2500, 4000];
      for (const wait of waits) {
        if (result.found || result.blocked) break;
        await page.waitForTimeout(wait);
        result = await page.evaluate(extractAbstractInPage, item.title);
      }
      const navigated = result.url !== urlBefore;
      record.bodyLen = result.bodyLen;
      record.titleSeen = result.titleSeen;
      record.navigated = navigated;
      if (result.found && navigated && result.titleSeen !== false) {
        record.status = "ok";
        record.abstract = result.found.text;
        record.source = result.found.source;
      } else if (result.blocked) {
        record.status = "blocked";
        record.finalUrl = result.url;
      } else if (!navigated || result.titleSeen === false) {
        // 页面没真的跳过去（或页面上根本不是这篇论文），留到下次重试
        record.status = "empty";
        record.stale = true;
        record.finalUrl = result.url;
        record.pageTitle = result.pageTitle;
      } else if (result.titleSeen === true || (result.titleSeen === null && result.bodyLen >= 1500)) {
        // 文章页确实渲染出来了（能看到标题），只是这类条目本来就没有摘要
        record.status = "no-abstract";
        record.finalUrl = result.url;
        record.pageTitle = result.pageTitle;
      } else {
        // 页面没渲染出来 / 内容过少，留到下次重试，不标记为"确认无摘要"
        record.status = "empty";
        record.finalUrl = result.url;
        record.pageTitle = result.pageTitle;
      }
      break;
    } catch (err) {
      record.status = "error";
      record.message = String(err).slice(0, 200);
      if (attempt === 0) await page.waitForTimeout(2000);
    }
  }
  record.ms = Date.now() - startedAt;
  console.log("__RESULT__" + JSON.stringify(record));
  await page.waitForTimeout(${PAGE_DELAY_MS} + Math.floor(Math.random() * 400));
}
`
}

function runEgoBatch(batch) {
  return new Promise((resolve) => {
    const child = spawn('ego-browser', ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.on('error', (err) => resolve({ code: -1, stdout: '', stderr: String(err) }))
    child.stdin.write(buildEgoScript(batch))
    child.stdin.end()
  })
}

function parseResults(stdout, stderr) {
  const results = []
  const errors = []
  // ego-browser CLI 把脚本的 console.log 写在 stderr 上，两边都要扫
  for (const line of `${stdout}\n${stderr}`.split('\n')) {
    if (line.startsWith('__RESULT__')) {
      try {
        results.push(JSON.parse(line.slice('__RESULT__'.length)))
      } catch {
        // 忽略坏行
      }
    }
  }
  for (const line of stderr.split('\n')) {
    if (/Error|error:|Cannot|failed/i.test(line) && line.trim()) {
      errors.push(line.trim().slice(0, 200))
    }
  }
  return { results, errors }
}

// ---------------------------------------------------------------------------
// Elsevier：纯 HTTP 直取（必须在机构网络里跑）
// ---------------------------------------------------------------------------

function readElsevierKey() {
  const direct = argValue('api-key', '')
  if (direct) return direct.trim()
  if (process.env.ELSEVIER_API_KEY) return process.env.ELSEVIER_API_KEY.trim()
  if (existsSync(API_KEY_FILE)) return readFileSync(API_KEY_FILE, 'utf-8').trim()
  return ''
}

/** 把 Elsevier 响应里的摘要抠出来，并去掉正文里的 HTML 标签。 */
function extractElsevierAbstract(payload) {
  const root =
    payload['full-text-retrieval-response'] || payload['abstracts-retrieval-response'] || payload
  const coredata = root.coredata || {}
  const raw = coredata['dc:description'] || root.abstract
  const text = raw
    ? String(raw)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : ''
  return { text, title: String(coredata['dc:title'] || '') }
}

/**
 * 逐条请求 Elsevier 摘要接口。
 * view=META_ABS 是唯一能拿到摘要的视图，且必须从订阅机构的网络出口发起，
 * 否则会返回 401 AUTHORIZATION_ERROR。
 */
async function fetchElsevierBatch(batch, apiKey) {
  const results = []
  // 3 路并发：Elsevier 配额是按周的（1 万次），这个速率远低于其限流阈值，
  // 但能把 6000 条从一小时压到二十分钟左右。
  const CONCURRENCY = 3
  let cursor = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, batch.length) }, async () => {
    while (cursor < batch.length) {
      const item = batch[cursor++]
      results.push(await fetchElsevierOne(item, apiKey))
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS + Math.floor(Math.random() * 300)))
    }
  })
  await Promise.all(workers)
  return results
}

async function fetchElsevierOne(item, apiKey) {
  const record = { id: item.id, doi: item.doi, publisher: item.publisher, url: item.url }
  const startedAt = Date.now()
  let done = false
  for (let attempt = 0; attempt < 2 && !done; attempt++) {
    try {
      const res = await fetch(
        `https://api.elsevier.com/content/abstract/doi/${encodeURIComponent(item.doi)}?view=META_ABS`,
        {
          headers: { 'X-ELS-APIKey': apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(30000)
        }
      )
      // 配额快见底时服务端会开始拒绝，记录头信息好判断要不要停
      const remaining = res.headers.get('x-ratelimit-remaining')
      if (remaining) record.quotaRemaining = Number(remaining)

      if (res.status === 401 || res.status === 403) {
        record.status = 'blocked'
        record.message = `HTTP ${res.status}：当前出口 IP 无机构订阅权益`
        done = true
      } else if (res.status === 404) {
        // Elsevier 库里没这条：多半是刚上线还没入库，留到以后重试
        record.status = 'empty'
        record.message = 'HTTP 404：Elsevier 尚未收录'
        done = true
      } else if (res.status === 429) {
        record.status = 'error'
        record.message = 'HTTP 429：触发限流'
        await new Promise((r) => setTimeout(r, 30000))
      } else if (!res.ok) {
        record.status = 'error'
        record.message = `HTTP ${res.status}`
        if (attempt === 0) await new Promise((r) => setTimeout(r, 3000))
      } else {
        const { text, title } = extractElsevierAbstract(await res.json())
        record.pageTitle = title
        if (text.length >= 200) {
          record.status = 'ok'
          record.abstract = text
          record.source = 'elsevier-api:view=META_ABS'
        } else {
          // 200 但没有摘要：这类多半是编者按/更正声明，确实没有摘要
          record.status = 'no-abstract'
        }
        done = true
      }
    } catch (err) {
      record.status = 'error'
      record.message = String(err).slice(0, 200)
      if (attempt === 0) await new Promise((r) => setTimeout(r, 3000))
    }
  }
  record.ms = Date.now() - startedAt
  return record
}

// ---------------------------------------------------------------------------
// apply：把结果写回数据库
// ---------------------------------------------------------------------------

function applyResults() {
  const results = loadJsonl(RESULTS_PATH)
  const ok = results.filter((r) => r.status === 'ok' && r.abstract)
  const db = openDb()
  db.pragma('busy_timeout = 10000')
  const update = db.prepare(
    `UPDATE papers SET abstract = ?, embedding = NULL
     WHERE id = ? AND (abstract IS NULL OR trim(abstract) = '')`
  )
  let applied = 0
  db.transaction(() => {
    for (const row of ok) {
      const info = update.run(row.abstract, row.id)
      applied += info.changes
    }
  })()
  db.close()
  return { applied, ok: ok.length }
}

// ---------------------------------------------------------------------------
// run：主循环
// ---------------------------------------------------------------------------

async function run() {
  mkdirSync(STATE_DIR, { recursive: true })
  let queue = loadQueue()
  if (!queue) {
    console.log('[backfill] 首次运行，正在从数据库生成待办清单…')
    const built = buildQueue()
    writeFileSync(QUEUE_PATH, JSON.stringify(built, null, 1))
    queue = built
    console.log(
      `[backfill] 缺失摘要 ${built.total} 篇，排除更正/编者按类 ${built.junk} 篇，待办 ${built.items.length} 篇`
    )
  }

  const includeElsevier = hasFlag('include-elsevier')
  const noAbstract = loadNoAbstract()
  // 只有真正有结论的条目才算跑完；empty / blocked / error 下次重跑还会再试
  const done = new Set(
    loadJsonl(RESULTS_PATH)
      .filter((r) => r.status === 'ok' || r.status === 'no-abstract')
      .map((r) => r.doi)
  )

  let pending = queue.items.filter((item) => {
    if (done.has(item.doi) || noAbstract.has(item.doi)) return false
    if (item.publisher === 'elsevier' && !includeElsevier) return false
    if (ONLY.length > 0 && !ONLY.includes(item.publisher)) return false
    if (EXCLUDE.length > 0 && EXCLUDE.includes(item.publisher)) return false
    return true
  })
  // 非 IEEE 的出版商几乎不会失败，先跑它们能最快拿到产出；IEEE 留到最后慢慢磨
  pending.sort((a, b) => (a.publisher === 'ieee' ? 1 : 0) - (b.publisher === 'ieee' ? 1 : 0))
  if (LIMIT > 0) pending = pending.slice(0, LIMIT)

  const skipped = queue.items.filter((i) => i.publisher === 'elsevier' && !includeElsevier).length
  const byPublisher = {}
  for (const item of pending) byPublisher[item.publisher] = (byPublisher[item.publisher] ?? 0) + 1

  console.log(`[backfill] 本轮待处理 ${pending.length} 篇：${JSON.stringify(byPublisher)}`)
  if (skipped > 0)
    console.log(`[backfill] 另有 ${skipped} 篇 Elsevier 因 ScienceDirect 人机验证被跳过`)
  if (pending.length === 0) {
    console.log('[backfill] 没有待处理条目')
    return
  }

  let emptyBatches = 0
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE)
    let results
    let errors = []
    let code = 0
    let stderr = ''
    if (HTTP_MODE && batch.every((item) => item.publisher === 'elsevier')) {
      results = await fetchElsevierBatch(batch, readElsevierKey())
    } else {
      const out = await runEgoBatch(batch)
      code = out.code
      stderr = out.stderr
      ;({ results, errors } = parseResults(out.stdout, out.stderr))
    }

    if (results.length === 0) {
      emptyBatches++
      console.log(
        `[backfill] 第 ${Math.floor(i / BATCH_SIZE) + 1} 批没有返回任何结果 (exit=${code})`
      )
      if (errors.length) console.log('   ' + errors.slice(0, 3).join('\n   '))
      if (stderr.trim())
        console.log('   stderr: ' + stderr.trim().split('\n').slice(-4).join(' | '))
      if (emptyBatches >= MAX_EMPTY_BATCHES) {
        console.log('[backfill] 连续多批失败，终止。检查 ego-browser 连接后重跑即可续传。')
        break
      }
      continue
    }
    emptyBatches = 0

    appendFileSync(RESULTS_PATH, results.map((r) => JSON.stringify(r)).join('\n') + '\n')
    for (const r of results) {
      if (r.status === 'no-abstract') noAbstract.add(r.doi)
    }
    saveNoAbstract(noAbstract)

    const okCount = results.filter((r) => r.status === 'ok').length
    const noAbsCount = results.filter((r) => r.status === 'no-abstract').length
    const blockedCount = results.filter((r) => r.status === 'blocked').length
    const errCount = results.filter(
      (r) => r.status !== 'ok' && r.status !== 'no-abstract' && r.status !== 'blocked'
    ).length
    const { applied } = FETCH_ONLY ? { applied: 0 } : applyResults()
    console.log(
      `[backfill] 进度 ${Math.min(i + batch.length, pending.length)}/${pending.length}` +
        ` | 本批 成功${okCount} 无摘要${noAbsCount} 拦截${blockedCount} 待重试${errCount}` +
        ` | 累计入库 ${applied}`
    )

    // IEEE 这类站点会在连续请求后开始返回 4xx，硬冲只会白跑；歇一会儿再继续
    const failCount = results.filter((r) => r.status === 'error').length
    if (failCount / results.length >= ERROR_RATE_COOLDOWN && i + BATCH_SIZE < pending.length) {
      console.log(
        `[backfill] 本批失败率 ${Math.round((failCount / results.length) * 100)}%，疑似被限流，冷却 ${Math.round(COOLDOWN_MS / 1000)}s`
      )
      await new Promise((r) => setTimeout(r, COOLDOWN_MS))
    }
  }

  const { applied, ok } = FETCH_ONLY ? { applied: 0, ok: 0 } : applyResults()
  console.log(
    FETCH_ONLY
      ? `[backfill] 结束：结果文件累计抓到 ${loadJsonl(RESULTS_PATH).filter((r) => r.status === 'ok').length} 条摘要（--fetch-only，未写库）`
      : `[backfill] 结束：结果文件累计抓到 ${ok} 条摘要，本轮新写入数据库 ${applied} 条`
  )
}

// ---------------------------------------------------------------------------

async function main() {
  if (command === 'plan') {
    const built = buildQueue()
    const byPublisher = {}
    for (const item of built.items)
      byPublisher[item.publisher] = (byPublisher[item.publisher] ?? 0) + 1
    console.log(`缺失摘要总计 ${built.total} 篇`)
    console.log(`排除更正/编者按/短标题 ${built.junk} 篇`)
    console.log(`待办 ${built.items.length} 篇：`)
    for (const [k, v] of Object.entries(byPublisher).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${k.padEnd(10)} ${v}`)
    }
    mkdirSync(STATE_DIR, { recursive: true })
    writeFileSync(QUEUE_PATH, JSON.stringify(built, null, 1))
    console.log(`\n清单已写入 ${QUEUE_PATH}`)
  } else if (command === 'run') {
    await run()
  } else if (command === 'apply') {
    const { applied, ok } = applyResults()
    console.log(`[backfill] 结果里有摘要 ${ok} 条，写入数据库 ${applied} 条`)
  } else {
    console.log('用法：node scripts/browser-backfill.mjs [plan|run|apply] [--limit N] [--db 路径]')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[backfill] 异常终止:', err)
  process.exit(1)
})
