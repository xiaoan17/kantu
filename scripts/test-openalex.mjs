// openalex.ts 离线测试：mock 全局 fetch，验证 issue 分组 / 摘要还原 / 翻页停止逻辑
import { createRequire } from 'module'
const oa = createRequire(import.meta.url)('./.oa-bundle.cjs')

let failures = 0
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`)
  if (!cond) failures++
}

function work(id, date, volume, issue, words) {
  return {
    id: `https://openalex.org/${id}`,
    display_name: `Paper ${id}`,
    abstract_inverted_index: words
      ? Object.fromEntries(words.split(' ').map((w, i) => [w, [i]]))
      : undefined,
    doi: `https://doi.org/10.1/${id}`,
    authorships: [{ author: { display_name: 'Alice' } }],
    publication_date: date,
    cited_by_count: 1,
    biblio: { volume, issue }
  }
}

// 两页数据：页1 含 issue 194|1（2篇）、无 issue（1篇）；页2 含 193|12（2篇）和更老的 193|11（应触发停止）
const page1 = [
  work('W1', '2026-08-10', '194', '1', 'Hello world'),
  work('W2', '2026-08-05', '194', '1', null),
  work('W3', '2026-08-20', null, null, 'Early view article')
]
const page2 = [
  work('W4', '2026-07-15', '193', '12', 'Older issue'),
  work('W5', '2026-07-10', '193', '12', null),
  work('W6', '2026-06-01', '193', '11', 'Should not appear')
]

let calls = []
globalThis.fetch = async (url) => {
  calls.push(url)
  const cursor = new URL(url).searchParams.get('cursor')
  const body =
    cursor === '*'
      ? { results: page1, meta: { next_cursor: 'page2' } }
      : { results: page2, meta: { next_cursor: 'end' } }
  return { ok: true, status: 200, json: async () => body }
}

const out = await oa.fetchRecentIssues({ openalexSourceId: 'S64511102', issn: '0968-090X' }, 2, '')

check('翻页请求了 2 次', calls.length === 2)
check('URL 含 source 过滤', calls[0].includes('primary_location.source.id'))
check('返回 2 个 issue 组（maxIssues=2）', out.length === 2)
check(
  '按最新日期降序，无 issue 组（08-20）排最前',
  out[0].issue.volume === null && out[0].issue.issue === null
)
check(
  '第二组为 194|1 且含 2 篇',
  out[1].issue.volume === '194' && out[1].issue.issue === '1' && out[1].papers.length === 2
)
check('193|11 被截断未收录', JSON.stringify(out).indexOf('W6') === -1)
check('摘要从 inverted index 还原', out[1].papers[0].abstract === 'Hello world')
check('无摘要论文 abstract 为 null', out[1].papers[1].abstract === null)
check('year 解析正确', out[1].issue.year === 2026)

// 429 报错信息含重置时间提示
globalThis.fetch = async () => ({
  ok: false,
  status: 429,
  json: async () => ({ retryAfter: 3600 })
})
let msg = ''
try {
  await oa.fetchRecentIssues({ openalexSourceId: 'S1', issn: null }, 7, '')
} catch (e) {
  msg = e.message
}
check('429 报错含中文重置提示', /频率超限/.test(msg) && /重置/.test(msg))

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
