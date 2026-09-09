import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_MD =
  '/Users/anbocheng/Library/CloudStorage/OneDrive-个人/Typora/文献阅读note/交通期刊/20260414-交通期刊综合分区表.md'
const OUT_PATH = join(ROOT, 'resources', 'journals.json')

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseImpactFactor(raw) {
  const v = raw.trim()
  if (v === '—' || v === '-' || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseText(raw) {
  const v = raw.trim()
  return v === '—' || v === '-' || v === '' ? null : v
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

const md = await readFile(SOURCE_MD, 'utf8')
const tableMatch = md.match(/<table>([\s\S]*?)<\/table>/)
if (!tableMatch) {
  console.error('No <table> found in source md')
  process.exit(1)
}

const rows = [...tableMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) =>
  [...m[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => decodeEntities(c[1]).trim())
)

const dataRows = rows.filter((r) => r.length >= 5 && r[0] !== '期刊名称')
console.log(`Parsed ${dataRows.length} journal rows`)

const journals = []
const seenSlugs = new Set()
for (const [name, jcrQuartile, impactFactor, casMajor, casMinor] of dataRows) {
  let id = slugify(name)
  if (seenSlugs.has(id)) {
    let i = 2
    while (seenSlugs.has(`${id}-${i}`)) i++
    id = `${id}-${i}`
  }
  seenSlugs.add(id)
  journals.push({
    id,
    name,
    impactFactor: parseImpactFactor(impactFactor),
    jcrQuartile: parseText(jcrQuartile),
    casMajor: parseText(casMajor),
    casMinor: parseText(casMinor)
  })
}

await mkdir(dirname(OUT_PATH), { recursive: true })
await writeFile(OUT_PATH, JSON.stringify(journals, null, 2) + '\n', 'utf8')
console.log(`Wrote ${journals.length} journals -> ${OUT_PATH}`)
const noIf = journals.filter((j) => j.impactFactor === null)
console.log(`Missing impact factor: ${noIf.length} (${noIf.map((j) => j.name).join(', ')})`)
