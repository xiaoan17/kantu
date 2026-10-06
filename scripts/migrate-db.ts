/**
 * 把当前代码里的表结构迁移应用到指定的 tjm.db。
 *
 * 走的是应用启动时同一套 initDatabase()，所以补列、建索引的行为与 App 完全一致；
 * 不需要先启动 App 才能升级老库。
 *
 * 用法：
 *   npm run migrate-db -- "<tjm.db 路径>"
 */
import { initDatabase } from '../src/main/db'

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('用法：migrate-db <tjm.db 路径>')
  process.exit(1)
}

initDatabase(dbPath)
console.log(`迁移完成：${dbPath}`)
