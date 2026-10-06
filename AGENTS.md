# AGENTS.md

面向在本仓库工作的 AI agent。**项目是什么 → 怎么快速用起来 → 环境约束 → 校验**。

## 项目是什么

**刊途 · Kantu**：交通运输领域的**论文选刊桌面工具**。输入论文标题 + 摘要，从本地语料库做
语义检索，推荐最合适的投稿期刊，并给出每本期刊的证据论文。

- 技术栈：Electron + React 19 + TypeScript + Tailwind CSS 4 + better-sqlite3 + electron-vite
- 链路：OpenAlex 抓论文 → 本地量化版 BGE Small EN v1.5（384 维）向量化 → 按期刊聚合推荐
- **运行期完全离线**：Embedding 走 onnxruntime-web（纯 WASM），除抓取与回填外不联网
- 语料口径（全项目唯一的"推荐语料"定义）：**有摘要 + 有向量 + 未撤稿**
- 只发布 **macOS arm64**；Windows / Linux 需自行构建

## 怎么快速用起来

### A. 只读数据 / 跑维护脚本（不用 GUI，不需要 API key）

数据库在 `userData` 目录下：

| 平台    | 路径                                                           |
| ------- | -------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/transport-journal-match/tjm.db` |
| Windows | `%APPDATA%\transport-journal-match\tjm.db`                     |
| Linux   | `~/.config/transport-journal-match/tjm.db`                     |

**关键坑**：App 注册了一个自定义 SQLite 函数 `has_abstract()`，**`sqlite3` CLI 里没有**。
想用命令行查语料必须手写等价 SQL（用 `sqlite3 "$DB"` 直接查）：

```sql
-- 推荐语料，等价于 App 的 getEmbeddingsWithMeta()
select count(*) from papers
where embedding is not null
  and is_retracted = 0
  and abstract is not null and trim(abstract) <> '';
```

实测在 2026-10-06 的库上得 **26508**，与 App 仪表盘报告的数字一致。

常用排查：

```bash
DB="$HOME/Library/Application Support/transport-journal-match/tjm.db"
sqlite3 "$DB" "select count(*) from papers;"                       # 论文总量
sqlite3 "$DB" "select count(*) from papers where is_retracted=1;"  # 撤稿数
sqlite3 "$DB" "select count(*) from journals;"                     # 期刊数
sqlite3 "$DB" "pragma quick_check;"                                # 完整性
```

### B. 把老库升级到最新表结构

App 启动会自动迁移；不想启 GUI 就单独跑：

```bash
npm run migrate-db -- "$DB"    # 幂等，重复跑无副作用，成功输出「迁移完成：<路径>」
```

### C. 重建 / 修语料

| 脚本                         | 作用                                    | 需要联网 |
| ---------------------------- | --------------------------------------- | -------- |
| `npm run backfill-browser`   | 回填出版商没同步给 OpenAlex 的摘要      | 是       |
| `npm run prune-non-articles` | 清理封面页 / 社论 / 更正 / 目录等非正文 | 是       |
| `npm run sync-retracted`     | 按 OpenAlex `is_retracted` 标记撤稿论文 | 是       |

**全部默认 dry-run**，加 `--apply` 才写库。涉及删除的会先自动 `db.backup()` 并校验行数与
`quick_check`，对不上就中止。详见 `docs/corpus-hygiene.md`。

### D. 开发 / 打包

```bash
npm install
npm run dev                # 开发窗口，热更新
npm run build              # typecheck + 打包到 out/
npm run build:local        # dist/mac-arm64/刊途.app（ad-hoc 签名，不出 dmg）
npm run build:mac:adhoc    # dmg + zip ← 分发用这个
```

## 环境约束（容易踩的坑）

- **`npm run build:mac` 会静默卡死**：它会启用钥匙串里的 Developer ID 证书，而
  `codesign --timestamp` 需要连 Apple 时间戳服务器；该网络不通时进程 `STAT=S`、CPU≈0，
  既不报错也不退出。未公证的本地分发一律用 **`build:mac:adhoc`**（跳过时间戳服务器，几十秒完成）。
- **CI 用 `npm ci --ignore-scripts`**，故意不下载 Electron 二进制、不编译 better-sqlite3。
  因此单测里凡是用到 Electron / 原生模块的用例，**必须能在环境缺失时自行 skip**
  （参考 `src/main/db.test.ts` 的 `it.skipIf`），否则 CI 恒红。
- **不要直接 `cp tjm.db`**：库开了 WAL，最近写入可能还在 `tjm.db-wal`，直接拷贝会丢数据。
  用 `sqlite3 "$DB" ".backup /tmp/tjm.db"` 取一致快照。
- 仓库里的 `scripts/.prune/`、`scripts/.browser-backfill/` 是本地工作目录（含论文元数据快照与
  Elsevier API key），**已 gitignore，不要提交**。

## 网络 / GitHub 访问

本机直连 GitHub（github.com:443）会超时，所有 GitHub 相关网络操作需走本机代理 `http://127.0.0.1:7897`。

- git 拉取/推送：
  `git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 pull origin main`
- npm install 如拉包失败：
  `export https_proxy=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897`

> 补充实测（2026-10-06）：直连 `github.com` 返回 200，`git push` 与 521MB 的 Release
> 上传均直连成功；代理端口 `7897` 虽 TCP 可达，但 `curl -x http://127.0.0.1:7897` 取不到内容。
> **建议先试直连，失败再挂代理**，而不是无条件先套代理。

## 常用校验命令

- 单元测试：`npm test`（vitest）
- 类型检查：`npm run typecheck`
- Lint：`npm run lint`

## 更细的文档

| 文档                        | 内容                                                     |
| --------------------------- | -------------------------------------------------------- |
| `docs/corpus-hygiene.md`    | 非正文清理、撤稿标记、表结构迁移、数据库快照分发         |
| `docs/abstract-backfill.md` | 摘要回填：各出版商提取位置、IEEE 站内接口、Elsevier 配额 |
| `docs/build-and-release.md` | 签名与公证、Release 结构、发布前校验清单                 |
| `docs/naming.md`            | 包名 / appId / userData 路径的历史与兼容约定             |
| `llms.txt`                  | 机器可读的文档索引与语料口径                             |
