import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IN_PATH = join(ROOT, 'resources', 'journals.json')
const OUT_PATH = join(ROOT, 'resources', 'journals.seed.json')

const MAILTO = process.env.MAILTO || ''
const REQUEST_INTERVAL_MS = 200

// 人工兜底：key 为分区表中的原始期刊名。
// query 覆盖搜索词；issn/openalexSourceId 齐全时跳过 API 直接使用。
const MANUAL_FIXES = {
  'Transportation Research Part A': { query: 'Transportation Research Part A: Policy and Practice' },
  'Transportation Research Part B': { query: 'Transportation Research Part B: Methodological' },
  'Transportation Research Part C': { query: 'Transportation Research Part C: Emerging Technologies' },
  'Transportation Research Part D': { query: 'Transportation Research Part D: Transport and Environment' },
  'Transportation Research Part E': { query: 'Transportation Research Part E: Logistics and Transportation Review' },
  'Transportation Research Part F': { query: 'Transportation Research Part F: Traffic Psychology and Behaviour' },
  'Transport reviews': { query: 'Transport Reviews' },
  'Accident Analysis and Prevention': { query: 'Accident Analysis & Prevention' },
  'Transportmetrica B': { query: 'Transportmetrica B: Transport Dynamics' },
  'Transportmetrica A-Transport Science': { query: 'Transportmetrica A: Transport Science' },
  'Transportmetrica B-Transport Dynamics': { query: 'Transportmetrica B: Transport Dynamics' },
  'Journal of public transportation': { query: 'Journal of Public Transportation' },
  'Construction and building materials': { query: 'Construction and Building Materials' },
  'Science of the total environment': { query: 'Science of The Total Environment' },
  'Transportation Letters-The International Journal of Transportation Research': {
    query: 'Transportation Letters'
  },
  'Journal of Traffic and Transportation Engineering-English Edition': {
    query: 'Journal of Traffic and Transportation Engineering (English Edition)'
  },
  'Proceedings of the Institution of Mechanical Engineers Part F-Journal of Rail and Rapid Transit': {
    query: 'Proceedings of the Institution of Mechanical Engineers Part F Journal of Rail and Rapid Transit'
  },
  'Proceedings of The Institution of Mechanical Engineers Part D-Journal of Automobile Engineering': {
    query: 'Proceedings of the Institution of Mechanical Engineers Part D Journal of Automobile Engineering'
  },
  'Journal of Transportation Engineering Part A: Systems': {
    query: 'Journal of Transportation Engineering Part A Systems'
  },
  'Journal of Transportation Engineering Part B: Pavements': {
    query: 'Journal of Transportation Engineering Part B Pavements'
  },
  // 以下 7 条经 OpenAlex 单实体端点逐一核验（搜索端点配额受限时的兜底）
  'Maritime Economics & Logistics': { issn: '1479-2931', openalexSourceId: 'S2764994788' },
  'Research in Transportation Business and Management': {
    issn: '2210-5395',
    openalexSourceId: 'S2764779785'
  },
  'Journal of Transport & Health': { issn: '2214-1405', openalexSourceId: 'S2764685396' },
  'Maritime Policy & Management': { issn: '0308-8839', openalexSourceId: 'S155850388' },
  'Journal of Transportation Safety & Security': {
    issn: '1943-9962',
    openalexSourceId: 'S118740754'
  },
  'Networks & Spatial Economics': { issn: '1566-113X', openalexSourceId: 'S80684715' },
  Transport: { issn: '1648-3480', openalexSourceId: 'S141734234' }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const UA = { 'User-Agent': 'transport-journal-match/0.1' }
const FETCH_TIMEOUT_MS = 20000
const MAX_RATE_LIMIT_WAIT_MS = 60000

async function searchSources(query) {
  const url = new URL('https://api.openalex.org/sources')
  url.searchParams.set('search', query)
  url.searchParams.set('per-page', '10')
  if (MAILTO) url.searchParams.set('mailto', MAILTO)
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (res.ok) {
      const data = await res.json()
      return data.results || []
    }
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt
      if (wait > MAX_RATE_LIMIT_WAIT_MS) {
        throw new Error(`OpenAlex ${res.status} for "${query}" (retry-after ${Math.round(wait / 1000)}s, giving up)`)
      }
      await sleep(wait)
      continue
    }
    throw new Error(`OpenAlex ${res.status} for "${query}"`)
  }
  throw new Error(`OpenAlex 429 for "${query}" (retries exhausted)`)
}

// 兜底路径：Crossref 按刊名查 ISSN，再用 OpenAlex 免费单实体端点 /sources/issn:<issn> 换 source id。
// Crossref 的 query 无法处理 '&'，替换为 'and'；只接受规范化后标题精确匹配的结果。
async function resolveViaCrossref(name) {
  const url = new URL('https://api.crossref.org/journals')
  url.searchParams.set('query', name.replace(/&/g, ' and '))
  url.searchParams.set('rows', '5')
  if (MAILTO) url.searchParams.set('mailto', MAILTO)
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Crossref ${res.status} for "${name}"`)
  const items = (await res.json())?.message?.items || []
  const target = normalize(name)
  const best = items.find((it) => normalize(it.title) === target)
  if (!best) return { issn: null, openalexSourceId: null, matchedName: null }
  const issn = best?.ISSN?.[0]
  if (!issn) return { issn: null, openalexSourceId: null, matchedName: best?.title || null }
  const oa = await fetch(`https://api.openalex.org/sources/issn:${issn}`, {
    headers: UA,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })
  if (!oa.ok) return { issn, openalexSourceId: null, matchedName: best.title }
  const src = await oa.json()
  return {
    issn: src.issn_l || issn,
    openalexSourceId: src.id ? src.id.split('/').pop() : null,
    matchedName: src.display_name || best.title
  }
}

function pickBest(results, name) {
  const target = normalize(name)
  const exact = results.find((r) => normalize(r.display_name) === target)
  if (exact) return exact
  return results.find((r) => r.type === 'journal') || null
}

function extract(result) {
  if (!result) return { issn: null, openalexSourceId: null }
  const issn = result.issn_l || (Array.isArray(result.issn) ? result.issn[0] : null) || null
  const openalexSourceId = result.id ? result.id.split('/').pop() : null
  return { issn, openalexSourceId }
}

const journals = JSON.parse(await readFile(IN_PATH, 'utf8'))

let cached = new Map()
if (!process.argv.includes('--force')) {
  try {
    const prev = JSON.parse(await readFile(OUT_PATH, 'utf8'))
    for (const p of prev) {
      if (p.issn && p.openalexSourceId) cached.set(p.id, p)
    }
    if (cached.size > 0) console.log(`Reusing ${cached.size} resolved entries from existing seed file`)
  } catch {
    // no previous seed file, resolve everything
  }
}

const seed = []
const failed = []

for (let i = 0; i < journals.length; i++) {
  const j = journals[i]
  const fix = MANUAL_FIXES[j.name]
  if (fix && fix.issn && fix.openalexSourceId) {
    console.log(
      `[${i + 1}/${journals.length}] ${j.name} -> (manual fix) | issn=${fix.issn} | ${fix.openalexSourceId}`
    )
    seed.push({ ...j, issn: fix.issn, openalexSourceId: fix.openalexSourceId })
    continue
  }
  const hit = cached.get(j.id)
  if (hit) {
    console.log(`[${i + 1}/${journals.length}] ${j.name} -> (cached) | issn=${hit.issn} | ${hit.openalexSourceId}`)
    seed.push({ ...j, issn: hit.issn, openalexSourceId: hit.openalexSourceId })
    continue
  }
  let issn = null
  let openalexSourceId = null
  let matchedName = null

  {
    const query = fix?.query || j.name
    try {
      const results = await searchSources(query)
      const best = pickBest(results, query)
      ;({ issn, openalexSourceId } = extract(best))
      matchedName = best ? best.display_name : null
    } catch (err) {
      console.error(`[${i + 1}/${journals.length}] ${j.name}: OpenAlex search failed: ${err.message}, trying Crossref fallback`)
      try {
        const fb = await resolveViaCrossref(query)
        ;({ issn, openalexSourceId } = fb)
        matchedName = fb.matchedName ? `${fb.matchedName} (crossref)` : null
      } catch (err2) {
        console.error(`[${i + 1}/${journals.length}] ${j.name}: Crossref fallback failed: ${err2.message}`)
      }
    }
    await sleep(REQUEST_INTERVAL_MS)
  }

  if (!issn || !openalexSourceId) failed.push(j.name)
  console.log(
    `[${i + 1}/${journals.length}] ${j.name} -> ${matchedName || 'NO MATCH'} | issn=${issn} | ${openalexSourceId}`
  )
  seed.push({ ...j, issn, openalexSourceId })
  await writeFile(OUT_PATH, JSON.stringify(seed, null, 2) + '\n', 'utf8')
}

await writeFile(OUT_PATH, JSON.stringify(seed, null, 2) + '\n', 'utf8')
console.log(`\nResolved ${seed.length - failed.length}/${seed.length} journals -> ${OUT_PATH}`)
if (failed.length > 0) {
  console.log(`Failed (${failed.length}):`)
  for (const name of failed) console.log(`  - ${name}`)
}
