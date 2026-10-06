import { it, expect } from 'vitest'
import { buildSync } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

/**
 * 这个集成检查必须在 Electron 运行时里跑：better-sqlite3 的原生模块是按 Electron ABI
 * 加载的，直接用 node 起不来。
 *
 * CI 用 `npm ci --ignore-scripts` 刻意跳过了 Electron 二进制下载与原生模块编译
 * （见 .github/workflows/ci.yml，lint / typecheck / 单测都不该依赖它们），所以那里
 * 既没有 Electron 可执行文件、也没有编译好的 better-sqlite3。这种情况下跳过本用例，
 * 而不是把一个"环境缺失"报成"测试失败"——否则 CI 永远是红的，等于没有信号。
 *
 * 探测到运行时就正常执行，所以本机跑 `npm test` 仍然会真正校验这段逻辑。
 */
function resolveElectronBinary(): string | null {
  try {
    const require = createRequire(import.meta.url)
    const binary = require('electron') as string
    return typeof binary === 'string' && existsSync(binary) ? binary : null
  } catch {
    // electron 包装模块在二进制缺失时直接抛错，这里视为"环境不具备"
    return null
  }
}

const electronBinary = resolveElectronBinary()

it.skipIf(!electronBinary)('Electron SQLite：旧库迁移、偏好持久化、摘要组合筛选和分页', () => {
  const dir = mkdtempSync(join(process.cwd(), 'node_modules/.tjm-test-'))
  try {
    const outfile = join(dir, 'check.cjs')
    buildSync({
      entryPoints: ['scripts/check-preferences-db.ts'],
      outfile,
      bundle: true,
      platform: 'node',
      packages: 'external'
    })
    const result = execFileSync(electronBinary as string, [outfile, join(dir, 'test.db')], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8'
    })
    expect(result).toContain('Database integration checks passed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
