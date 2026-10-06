import { it, expect } from 'vitest'
import { buildSync } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

it('Electron SQLite：旧库迁移、偏好持久化、摘要组合筛选和分页', () => {
  const require = createRequire(import.meta.url)
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
    const result = execFileSync(require('electron') as string, [outfile, join(dir, 'test.db')], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8'
    })
    expect(result).toContain('Database integration checks passed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
